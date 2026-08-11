// Contract tests for the studio C4CanvasHost (issue #132): every callback
// maps to the right write-API call with the right payload, and the
// OPTIMISTIC-LOCAL fallback semantics hold — boolean core callbacks return
// false so the store's own undoable edit proceeds while the server write
// rides alongside. Component-level behaviour (who calls these callbacks,
// and when) is covered by `@workspec/c4-ui`'s own c4-host contract tests;
// these tests drive the host directly against a REAL canvas store.

import { describe, expect, it, vi } from 'vitest';
import { createCanvasStore } from '@workspec/canvas';
import type { CanvasStoreInstance, Shape, ShapeId } from '@workspec/canvas';
import { getC4Host, nodeShapeId, registerC4 } from '@workspec/c4-ui';
import type { C4NodeShape } from '@workspec/c4-ui';
import type { MutationApi } from './mutation-api.types.js';
import { installStudioCanvasHost } from './studio-canvas-host.js';
import type { StudioCanvasHostOptions } from './studio-canvas-host.js';

/** A fully-mocked MutationApi; every method resolves by default. */
function fakeApi(): { [K in keyof MutationApi]: ReturnType<typeof vi.fn> } {
  return {
    createElement: vi.fn(() => Promise.resolve({})),
    updateElement: vi.fn(() => Promise.resolve({})),
    deleteElement: vi.fn(() => Promise.resolve({})),
    removeDiagramNode: vi.fn(() => Promise.resolve({})),
    createRelation: vi.fn(() => Promise.resolve({})),
    renameRelation: vi.fn(() => Promise.resolve({})),
    deleteRelation: vi.fn(() => Promise.resolve({})),
    clearLayout: vi.fn(() => Promise.resolve()),
  };
}

function nodeShape(slug: string, overrides: Partial<C4NodeShape> = {}): C4NodeShape {
  return {
    id: nodeShapeId(slug),
    type: 'c4node',
    index: 'a1',
    x: 0,
    y: 0,
    width: 300,
    height: 110,
    slug,
    nodeType: 'container',
    label: slug,
    meta: { ephemeral: true, slug },
    ...overrides,
  };
}

interface Harness {
  instance: CanvasStoreInstance;
  api: ReturnType<typeof fakeApi>;
  onWriteError: ReturnType<typeof vi.fn>;
  onMutated: ReturnType<typeof vi.fn>;
  host: ReturnType<typeof installStudioCanvasHost>;
}

function setup(shapes: Shape[] = [], options: Partial<StudioCanvasHostOptions> = {}): Harness {
  const instance = createCanvasStore();
  registerC4(instance);
  if (shapes.length > 0) {
    instance
      .getState()
      ._setShapesRaw(Object.fromEntries(shapes.map((s) => [s.id, s])) as Record<ShapeId, Shape>);
  }
  const api = fakeApi();
  const onWriteError = vi.fn();
  const onMutated = vi.fn();
  const host = installStudioCanvasHost(instance, {
    diagramSlug: () => 'system-context',
    api: api as unknown as MutationApi,
    onWriteError,
    onMutated,
    ...options,
  });
  return { instance, api, onWriteError, onMutated, host };
}

const flush = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe('installation', () => {
  it('installs the SAME object on instance.host (one object, one seam)', () => {
    const { instance, host } = setup();
    expect(instance.host).toBe(host);
    expect(getC4Host(instance)).toBe(host);
  });
});

describe('commitNewNode', () => {
  it('creates the element on the CURRENT diagram with the pending card position', async () => {
    const { host, api, onMutated } = setup();
    host.commitNewNode?.('container', 'Checkout', { x: 120, y: 60 });
    await flush();
    expect(api.createElement).toHaveBeenCalledWith({
      kind: 'container',
      name: 'Checkout',
      diagram: 'system-context',
      position: { x: 120, y: 60 },
    });
    expect(onMutated).toHaveBeenCalledTimes(1);
  });

  it('refuses a non-element nodeType without calling the API', async () => {
    const { host, api, onWriteError, onMutated } = setup();
    host.commitNewNode?.('class', 'Parser', { x: 0, y: 0 });
    await flush();
    expect(api.createElement).not.toHaveBeenCalled();
    expect(onMutated).not.toHaveBeenCalled();
    expect(onWriteError).toHaveBeenCalledWith('"class" is not a creatable element kind');
  });

  it('surfaces a rejected write through onWriteError and does NOT refetch', async () => {
    const { host, api, onWriteError, onMutated } = setup();
    api.createElement.mockImplementation(() => Promise.reject(new Error('409 already exists')));
    host.commitNewNode?.('container', 'Checkout', { x: 0, y: 0 });
    await flush();
    expect(onWriteError).toHaveBeenCalledWith('409 already exists');
    expect(onMutated).not.toHaveBeenCalled();
  });
});

describe('renameNode', () => {
  it('PATCHes the element, resolving kind from the node shape', async () => {
    const { host, api, onMutated } = setup([nodeShape('web-app')]);
    host.renameNode?.('web-app', 'Portal');
    await flush();
    expect(api.updateElement).toHaveBeenCalledWith({
      slug: 'web-app',
      kind: 'container',
      name: 'Portal',
    });
    expect(onMutated).toHaveBeenCalledTimes(1);
  });

  it('prefers meta.elementSlug over the nodeId for aliased nodes', async () => {
    const aliased = nodeShape('__system__', {
      nodeType: 'system',
      meta: { ephemeral: true, slug: '__system__', elementSlug: 'main-system' },
    });
    const { host, api } = setup([aliased]);
    host.renameNode?.('__system__', 'Ledger');
    await flush();
    expect(api.updateElement).toHaveBeenCalledWith({
      slug: 'main-system',
      kind: 'system',
      name: 'Ledger',
    });
  });

  it('falls back to the slug alone when no shape resolves', async () => {
    const { host, api } = setup();
    host.renameNode?.('ghost', 'Spook');
    await flush();
    expect(api.updateElement).toHaveBeenCalledWith({ slug: 'ghost', name: 'Spook' });
  });

  it('refuses to rename an unresolved __system__ alias', async () => {
    const bare = nodeShape('__system__', {
      nodeType: 'system',
      meta: { ephemeral: true, slug: '__system__' },
    });
    const { host, api, onWriteError } = setup([bare]);
    host.renameNode?.('__system__', 'X');
    await flush();
    expect(api.updateElement).not.toHaveBeenCalled();
    expect(onWriteError).toHaveBeenCalled();
  });
});

describe('deleteShapes — optimistic-local + DIAGRAM-SCOPED server removal', () => {
  it('returns false so the local undoable delete proceeds, and removes the node from THIS diagram only', async () => {
    const shape = nodeShape('web-app');
    const { instance, api, onMutated } = setup([shape]);

    instance.getState().deleteShapes([shape.id]);
    // Optimistic local: gone now, undoable — the fallback contract.
    expect(instance.getState().shapes[shape.id]).toBeUndefined();
    instance.getState().undo();
    expect(instance.getState().shapes[shape.id]).toBeDefined();

    await flush();
    // The canvas gesture is diagram-scoped (A2 review lead ruling): the
    // node ref goes, the element file stays. Tree-wide deleteElement is
    // NEVER fired from a canvas gesture.
    expect(api.removeDiagramNode).toHaveBeenCalledWith({
      diagram: 'system-context',
      node: 'web-app',
    });
    expect(api.deleteElement).not.toHaveBeenCalled();
    expect(onMutated).toHaveBeenCalledTimes(1);
  });

  it('deletes a connector as a relation on the current diagram', async () => {
    const edge: Shape = {
      id: 'c4e_architect____system__' as ShapeId,
      type: 'connector',
      index: 'a2',
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      edgeFrom: 'architect',
      edgeTo: '__system__',
      meta: { ephemeral: true },
    };
    const { instance, api } = setup([edge]);
    instance.getState().deleteShapes([edge.id]);
    await flush();
    expect(api.deleteRelation).toHaveBeenCalledWith({
      diagram: 'system-context',
      from: 'architect',
      to: '__system__',
    });
  });

  it('skips pending nodes (never persisted) with no API call and no error', async () => {
    const pending = nodeShape('pending-1', { meta: { pending: true, slug: 'pending-1' } });
    const { instance, api, onWriteError, onMutated } = setup([pending]);
    instance.getState().deleteShapes([pending.id]);
    await flush();
    expect(api.removeDiagramNode).not.toHaveBeenCalled();
    expect(api.deleteElement).not.toHaveBeenCalled();
    expect(onWriteError).not.toHaveBeenCalled();
    expect(onMutated).not.toHaveBeenCalled();
    // The local delete still landed.
    expect(instance.getState().shapes[pending.id]).toBeUndefined();
  });

  it('refuses resolver-injected nodes with a message instead of a removal', async () => {
    const injected = nodeShape('main-system', {
      nodeType: 'system',
      meta: { ephemeral: true, slug: 'main-system', injected: true },
    });
    const { instance, api, onWriteError } = setup([injected]);
    instance.getState().deleteShapes([injected.id]);
    await flush();
    expect(api.removeDiagramNode).not.toHaveBeenCalled();
    expect(api.deleteElement).not.toHaveBeenCalled();
    expect(onWriteError).toHaveBeenCalled();
  });

  it('reports the first failure but still refetches for the writes that landed', async () => {
    const a = nodeShape('a');
    const b = nodeShape('b');
    const { instance, api, onWriteError, onMutated } = setup([a, b]);
    api.removeDiagramNode
      .mockImplementationOnce(() => Promise.reject(new Error('500 internal error')))
      .mockImplementationOnce(() => Promise.resolve({}));
    instance.getState().deleteShapes([a.id, b.id]);
    await flush();
    expect(onWriteError).toHaveBeenCalledWith('500 internal error');
    expect(onMutated).toHaveBeenCalledTimes(1);
  });
});

describe('edges', () => {
  it('createEdge posts the relation for the diagram showing at gesture time', async () => {
    let current = 'system-context';
    const { host, api, onMutated } = setup([], { diagramSlug: () => current });
    host.createEdge?.('architect', '__system__');
    await flush();
    expect(api.createRelation).toHaveBeenCalledWith({
      diagram: 'system-context',
      from: 'architect',
      to: '__system__',
    });

    current = 'container';
    host.createEdge?.('billing', 'event-bus');
    await flush();
    expect(api.createRelation).toHaveBeenLastCalledWith({
      diagram: 'container',
      from: 'billing',
      to: 'event-bus',
    });
    expect(onMutated).toHaveBeenCalledTimes(2);
  });

  it('renameEdge patches the relation label', async () => {
    const { host, api } = setup();
    host.renameEdge?.('architect', '__system__', 'designs in');
    await flush();
    expect(api.renameRelation).toHaveBeenCalledWith({
      diagram: 'system-context',
      from: 'architect',
      to: '__system__',
      label: 'designs in',
    });
  });
});

describe('autoLayout', () => {
  it('defaults to clearing the diagram layout pins', async () => {
    const { host, api, onMutated } = setup();
    host.autoLayout?.();
    await flush();
    expect(api.clearLayout).toHaveBeenCalledWith('system-context');
    expect(onMutated).toHaveBeenCalledTimes(1);
  });

  it('an explicit autoLayout option overrides the default', async () => {
    const custom = vi.fn();
    const { host, api } = setup([], { autoLayout: custom });
    host.autoLayout?.();
    await flush();
    expect(custom).toHaveBeenCalledTimes(1);
    expect(api.clearLayout).not.toHaveBeenCalled();
  });
});

describe('placeNode', () => {
  it('creates a local pending card (no write) and opens the inline editor', () => {
    const { instance, host, api } = setup([], { toPagePoint: (p) => p });
    host.placeNode?.('database', { x: 400, y: 300 });

    const state = instance.getState();
    const pending = Object.values(state.shapes).find((s) => s.type === 'c4node') as
      C4NodeShape | undefined;
    expect(pending).toBeDefined();
    if (!pending) throw new Error('unreachable');
    expect(pending.nodeType).toBe('database');
    expect(pending.label).toBe('');
    expect(pending.meta?.pending).toBe(true);
    // Centred on the drop point.
    expect(pending.x + pending.width / 2).toBe(400);
    expect(pending.y + pending.height / 2).toBe(300);
    // Selected + editing so the name editor opens; nothing written yet.
    expect(state.editingId).toBe(pending.id);
    expect(state.selectedIds.has(pending.id)).toBe(true);
    expect(api.createElement).not.toHaveBeenCalled();
  });
});

describe('local-only core callbacks', () => {
  it('renameShape and moveToContainer decline so the store fallback runs', () => {
    const { host } = setup();
    expect(host.renameShape?.(nodeShapeId('x'), 'y')).toBe(false);
    expect(host.moveToContainer?.([nodeShapeId('x')], null)).toBe(false);
  });

  it('shell navigation callbacks ride the same host object only when provided', () => {
    const drillDown = vi.fn();
    const withNav = setup([], { drillDown });
    expect(withNav.host.drillDown).toBe(drillDown);
    const withoutNav = setup();
    expect(withoutNav.host.drillDown).toBeUndefined();
  });
});
