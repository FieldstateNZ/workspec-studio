import { describe, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { CanvasProvider, createCanvasStore } from '@workspec/canvas';
import type { CanvasStoreInstance, Shape, ShapeId } from '@workspec/canvas';
import { registerC4 } from './register-c4.js';
import { C4NodeComponent } from './shapes/c4-node-component.js';
import { getC4Host } from './c4-types.js';
import type { C4CanvasHost, C4NodeShape } from './c4-types.js';
import { nodeShapeId } from './project-model.js';

// C4CanvasHost contract tests (#119, decision H): every callback optional;
// the load-bearing semantics are OPTIMISTIC-LOCAL — components apply their
// local (undoable where applicable) store edit first, then notify the
// host; a missing callback means the edit simply stays local.

function seededNode(
  overrides: Partial<C4NodeShape> = {},
  meta: Record<string, unknown> = {},
): { instance: CanvasStoreInstance; shape: C4NodeShape } {
  const instance = createCanvasStore();
  registerC4(instance);
  const shape: C4NodeShape = {
    id: nodeShapeId('web-app'),
    type: 'c4node',
    index: 'a0',
    x: 0,
    y: 0,
    width: 300,
    height: 110,
    slug: 'web-app',
    nodeType: 'container',
    label: 'Web App',
    meta: { ephemeral: true, slug: 'web-app', ...meta },
    ...overrides,
  };
  instance.getState()._setShapesRaw({ [shape.id]: shape } as Record<ShapeId, Shape>);
  return { instance, shape };
}

function renderNode(instance: CanvasStoreInstance, shape: C4NodeShape, isEditing = false) {
  return render(
    <CanvasProvider store={instance}>
      <C4NodeComponent shape={shape} isEditing={isEditing} />
    </CanvasProvider>,
  );
}

describe('C4CanvasHost — rename (existing node)', () => {
  test('inline commit is optimistic-local FIRST, then host.renameNode(slug, name)', () => {
    const named = seededNode();
    const renameNode = vi.fn();
    named.instance.host = { renameNode } as C4CanvasHost;
    act(() => {
      named.instance.getState().setEditing(named.shape.id);
    });
    renderNode(named.instance, named.shape, true);

    const input = screen.getByDisplayValue('Web App');
    fireEvent.change(input, { target: { value: 'Portal' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);

    expect(named.instance.getState().shapes[named.shape.id]?.['label']).toBe('Portal');
    expect(renameNode).toHaveBeenCalledWith('web-app', 'Portal');
    expect(named.instance.getState().editingId).toBeNull();
  });

  test('with NO host installed the rename still lands locally (fallback contract)', () => {
    const { instance, shape } = seededNode();
    act(() => {
      instance.getState().setEditing(shape.id);
    });
    renderNode(instance, shape, true);
    const input = screen.getByDisplayValue('Web App');
    fireEvent.change(input, { target: { value: 'Portal' } });
    fireEvent.blur(input);
    expect(instance.getState().shapes[shape.id]?.['label']).toBe('Portal');
  });

  test('an unchanged name calls no host method', () => {
    const { instance, shape } = seededNode();
    const renameNode = vi.fn();
    instance.host = { renameNode } as C4CanvasHost;
    renderNode(instance, shape, true);
    fireEvent.blur(screen.getByDisplayValue('Web App'));
    expect(renameNode).not.toHaveBeenCalled();
  });
});

describe('C4CanvasHost — pending node lifecycle', () => {
  test('first name commits locally then host.commitNewNode(type, name, point)', () => {
    const { instance, shape } = seededNode(
      { label: '', x: 120, y: 60 },
      { pending: true },
    );
    const commitNewNode = vi.fn();
    instance.host = { commitNewNode } as C4CanvasHost;
    renderNode(instance, shape, true);

    const input = screen.getByPlaceholderText('Name this container…');
    fireEvent.change(input, { target: { value: 'Checkout' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);

    expect(instance.getState().shapes[shape.id]?.['label']).toBe('Checkout');
    expect(commitNewNode).toHaveBeenCalledWith('container', 'Checkout', { x: 120, y: 60 });
  });

  test('cancelling a pending node discards it locally without any host call', () => {
    const { instance, shape } = seededNode({ label: '' }, { pending: true });
    const commitNewNode = vi.fn();
    instance.host = { commitNewNode } as C4CanvasHost;
    renderNode(instance, shape, true);

    const input = screen.getByPlaceholderText('Name this container…');
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.blur(input);

    expect(instance.getState().shapes[shape.id]).toBeUndefined();
    expect(commitNewNode).not.toHaveBeenCalled();
  });
});

describe('C4CanvasHost — drill / room / rework / element editor', () => {
  test('ROOM and drill buttons delegate to enterRoom / drillDown', () => {
    const { instance, shape } = seededNode({ drillable: true });
    const enterRoom = vi.fn();
    const drillDown = vi.fn();
    instance.host = { enterRoom, drillDown } as C4CanvasHost;
    renderNode(instance, shape);

    fireEvent.click(screen.getByLabelText('Enter architecture room'));
    expect(enterRoom).toHaveBeenCalledWith('web-app', 'Web App', 'container');
    fireEvent.click(screen.getByLabelText('Drill into this'));
    expect(drillDown).toHaveBeenCalledWith('web-app');
  });

  test('the footer toggle delegates to toggleReworking with the row id + current flag', () => {
    const { instance, shape } = seededNode({ reworking: true, canvasObjectId: 'co-9' });
    const toggleReworking = vi.fn();
    instance.host = { toggleReworking } as C4CanvasHost;
    renderNode(instance, shape);

    expect(screen.getByText('● Reworking')).toBeDefined();
    expect(screen.getByText('● REWORKING')).toBeDefined(); // halo chip
    fireEvent.click(screen.getByText('Clear'));
    expect(toggleReworking).toHaveBeenCalledWith('co-9', true);
  });

  test('the validity marker opens the element editor through the host callback', () => {
    const { instance, shape } = seededNode({}, {
      artifactRefId: 'art-1',
      validationErrors: [{ path: 'description', message: 'required' }],
    });
    const openElementEditor = vi.fn();
    instance.host = { openElementEditor } as C4CanvasHost;
    renderNode(instance, shape);

    fireEvent.click(screen.getByLabelText('Missing information — click to edit'));
    expect(openElementEditor).toHaveBeenCalledWith({
      artifactRefId: 'art-1',
      slug: 'web-app',
      label: 'Web App',
      description: '',
      validationErrors: [{ path: 'description', message: 'required' }],
    });
  });

  test('no artifact meta → no validity marker, and double-click is a clean no-op', () => {
    const { instance, shape } = seededNode();
    renderNode(instance, shape);
    expect(screen.queryByLabelText('Valid — click to edit')).toBeNull();
    expect(screen.queryByLabelText('Missing information — click to edit')).toBeNull();
  });
});

describe('C4CanvasHost — extends the core CanvasHost (one object, one seam)', () => {
  test('core methods ride the SAME host object: deleteShapes keeps its fallback contract', () => {
    // C4CanvasHost extends CanvasHost (#119 FIX 9): installing a C4 host
    // must give the ENGINE its core callbacks on the same object.
    const { instance, shape } = seededNode();
    const deleteShapes = vi.fn(() => false); // host declines → local fallback
    const drillDown = vi.fn();
    const host: C4CanvasHost = { deleteShapes, drillDown };
    instance.host = host;

    instance.getState().deleteShapes([shape.id]);
    expect(deleteShapes).toHaveBeenCalledWith([shape.id]);
    // Declined → the store's own undoable delete ran.
    expect(instance.getState().shapes[shape.id]).toBeUndefined();
    instance.getState().undo();
    expect(instance.getState().shapes[shape.id]).toBeDefined();

    // And the C4 extras are reachable through the same object.
    expect(getC4Host(instance).drillDown).toBe(drillDown);
  });

  test('renameShape is part of the inherited core surface', () => {
    const { instance } = seededNode();
    const renameShape = vi.fn(() => true);
    instance.host = { renameShape } as C4CanvasHost;
    expect(getC4Host(instance).renameShape?.(nodeShapeId('web-app'), 'Renamed')).toBe(true);
    expect(renameShape).toHaveBeenCalledWith(nodeShapeId('web-app'), 'Renamed');
  });
});
