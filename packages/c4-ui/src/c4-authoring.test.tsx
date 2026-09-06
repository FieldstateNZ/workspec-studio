// The A3 authoring surface (#133), driven through the REAL canvas engine —
// real toolbar clicks, real pointer gestures on the real pipeline, real
// inline editors. Nothing here calls a store action to simulate a gesture:
// every loop starts at a DOM event the user could produce, so a break
// anywhere between the event and `instance.host` fails the test.
//
// What each block guards, and the mutation that kills it, is stated at the
// block. The four acceptance guards from the #133 ledger — Escape
// precedence, the Backspace typing guard, the element-editor entry point,
// and viewer-mode inertness — each have a test that dies under the obvious
// simplification.

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { layoutDiagram } from '@workspec/c4-layout';
import type { PositionedDiagram } from '@workspec/c4-layout';
import type { C4Model, ResolvedDiagram } from '@workspec/c4-model';
import type { CanvasStoreInstance } from '@workspec/canvas';
import { C4Diagram } from './c4-diagram.js';
import { paletteForDiagram } from './c4-canvas/c4-palette.js';
import { nodeShapeId } from './c4/index.js';
import type { C4CanvasHost } from './c4/index.js';
import { firePointer } from './test-helpers/fire-pointer.js';
import { loadSyntheticModel } from './test-helpers/synthetic-model.js';

interface Loaded {
  model: C4Model;
  resolved: ResolvedDiagram;
  diagram: PositionedDiagram;
}

/** Lays out one diagram of the synthetic model, optionally for a named lens view. */
async function load(slug: string, lens?: 'logical' | 'deployment'): Promise<Loaded> {
  const model = await loadSyntheticModel();
  const resolved = model.diagrams.find((d) => d.slug === slug);
  if (!resolved) throw new Error(`fixture missing the ${slug} diagram`);
  const view = lens !== undefined && resolved.lensViews ? resolved.lensViews[lens] : resolved.view;
  if (!view) throw new Error(`fixture missing a view for ${slug}`);
  const diagram = await layoutDiagram({
    nodes: view.nodes,
    edges: view.edges,
    layout: resolved.layout?.data ?? null,
  });
  return { model, resolved, diagram };
}

/** A host that records every bridge call — the assertion surface for "the gesture reached the host". */
function spyHost(): {
  host: C4CanvasHost;
  calls: {
    placeNode: ReturnType<typeof vi.fn>;
    createEdge: ReturnType<typeof vi.fn>;
    renameNode: ReturnType<typeof vi.fn>;
    renameEdge: ReturnType<typeof vi.fn>;
    deleteShapes: ReturnType<typeof vi.fn>;
    autoLayout: ReturnType<typeof vi.fn>;
    openElementEditor: ReturnType<typeof vi.fn>;
  };
} {
  const calls = {
    placeNode: vi.fn(),
    createEdge: vi.fn(),
    renameNode: vi.fn(),
    renameEdge: vi.fn(),
    deleteShapes: vi.fn(() => false),
    autoLayout: vi.fn(),
    openElementEditor: vi.fn(),
  };
  return { host: calls as unknown as C4CanvasHost, calls };
}

function canvasRoot(container: HTMLElement): Element {
  const root = container.querySelector('[data-canvas-root]');
  if (!root) throw new Error('canvas root missing');
  return root;
}

/** The `.c4-diagram` container — the page's only keyboard surface (`shortcutScope="none"`). */
function outerOf(container: HTMLElement): HTMLElement {
  return container.querySelector('.c4-diagram') as HTMLElement;
}

/** The node's page-centre. jsdom rects are zero, so page === client at the identity camera. */
function centerOf(diagram: PositionedDiagram, nodeId: string): { clientX: number; clientY: number } {
  const node = diagram.nodes.find((n) => n.nodeId === nodeId);
  if (!node) throw new Error(`node ${nodeId} missing`);
  return { clientX: node.x + node.width / 2, clientY: node.y + node.height / 2 };
}

/**
 * Where `ConnectorLayer` drew a given edge's label pill, in client
 * coordinates — a point guaranteed to be ON the edge's polyline, taken from
 * the render rather than hard-coded against a layout that may change. The
 * pill is positioned in SCREEN space, which equals client space here (zero
 * jsdom rects, identity camera).
 */
function labelPointOf(container: HTMLElement, label: string): { clientX: number; clientY: number } {
  const pill = [...container.querySelectorAll<HTMLElement>('div')].find(
    (el) => el.textContent === label && el.style.position === 'absolute' && el.style.left !== '',
  );
  if (!pill) throw new Error(`no edge label pill for "${label}"`);
  return { clientX: parseFloat(pill.style.left), clientY: parseFloat(pill.style.top) };
}

/**
 * The `.c4-el` CARD inside a node's a11y wrapper. Double-click is bound on
 * the card, not the wrapper, so firing on the wrapper would never reach the
 * handler (React events bubble up, not down) — a vacuous pass.
 */
function cardOf(accessibleName: RegExp): HTMLElement {
  const card = screen.getByRole('button', { name: accessibleName }).querySelector('.c4-el');
  if (!card) throw new Error(`no card for ${String(accessibleName)}`);
  return card as HTMLElement;
}

function clickAt(target: Element, at: { clientX: number; clientY: number }): void {
  firePointer(target, 'pointerdown', at);
  firePointer(target, 'pointerup', at);
}

/** A right-button click — the engine opens the menu on right pointerdown+up with no drag. */
function rightClickAt(target: Element, at: { clientX: number; clientY: number }): void {
  firePointer(target, 'pointerdown', { ...at, button: 2 });
  firePointer(target, 'pointerup', { ...at, button: 2 });
}

/** Renders one authoring canvas with a spy host installed via `onCanvasReady`. */
async function renderAuthoring(
  slug: string,
  lens?: 'logical' | 'deployment',
): Promise<{
  container: HTMLElement;
  diagram: PositionedDiagram;
  instance: CanvasStoreInstance;
  calls: ReturnType<typeof spyHost>['calls'];
  onSelect: ReturnType<typeof vi.fn>;
}> {
  const { resolved, diagram } = await load(slug, lens);
  const { host, calls } = spyHost();
  let instance: CanvasStoreInstance | null = null;
  const onSelect = vi.fn();
  const { container } = render(
    <C4Diagram
      diagram={diagram}
      resolved={resolved}
      onSelect={onSelect}
      authoring
      {...(lens !== undefined ? { lens } : {})}
      onCanvasReady={(inst) => {
        instance = inst;
        inst.host = host;
      }}
    />,
  );
  if (instance === null) throw new Error('onCanvasReady never fired');
  return { container, diagram, instance, calls, onSelect };
}

// ── Palette derivation ──────────────────────────────────────────────────────
// Guards the enterprise `paletteFor` mapping (C4Toolbar.tsx:46-61). Mutation:
// swapping either container branch, or adding `system` to the context list,
// fails here.
describe('paletteForDiagram — enterprise C4Toolbar.tsx:46-61, verbatim', () => {
  it('offers the surrounding cast at the context level, never the system itself', () => {
    expect(paletteForDiagram('c4-context', 'logical')).toEqual(['actor', 'external-system']);
  });

  it('splits the container level by lens: domains logically, infrastructure on deployment', () => {
    expect(paletteForDiagram('c4-container', 'logical')).toEqual(['domain', 'external-system']);
    expect(paletteForDiagram('c4-container', 'deployment')).toEqual([
      'container',
      'database',
      'queue',
      'external-system',
    ]);
  });

  it('offers components and their stores at the component level', () => {
    expect(paletteForDiagram('c4-component', 'logical')).toEqual([
      'component',
      'database',
      'queue',
    ]);
  });

  it('falls back to the context palette for an unrecognised type (enterprise default branch)', () => {
    expect(paletteForDiagram('c4-deployment', 'logical')).toEqual(['actor', 'external-system']);
  });
});

// ── Viewer inertness ────────────────────────────────────────────────────────
// The whole surface is opt-in. Mutation: defaulting `authoring` to true, or
// dropping any `authoring &&` gate in C4Diagram, fails here — which is also
// what keeps the parity goldens byte-stable.
describe('C4Diagram — authoring is opt-in; omitting it leaves the viewer untouched', () => {
  it('mounts no toolbar, no placement hint, and still suppresses the context menu', async () => {
    const { resolved, diagram } = await load('context');
    const { container } = render(<C4Diagram diagram={diagram} resolved={resolved} />);

    expect(screen.queryByRole('toolbar', { name: 'C4 tools' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add Actor' })).toBeNull();
    expect(container.querySelector('.c4-place-hint')).toBeNull();

    rightClickAt(canvasRoot(container), centerOf(diagram, 'architect'));
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('registers no place or connector tool, so neither is reachable at all', async () => {
    const { resolved, diagram } = await load('context');
    let instance: CanvasStoreInstance | null = null;
    render(
      <C4Diagram
        diagram={diagram}
        resolved={resolved}
        onCanvasReady={(inst) => {
          instance = inst;
        }}
      />,
    );
    const tools = (instance as unknown as CanvasStoreInstance).tools;
    expect(tools.get('place')).toBeUndefined();
    expect(tools.get('connector')).toBeUndefined();
  });
});

// ── The toolbar itself ──────────────────────────────────────────────────────
describe('C4Toolbar — enterprise affordances, placement and order', () => {
  it('renders the tools group top-right in enterprise order, with title === aria-label', async () => {
    const { container } = await renderAuthoring('context');
    const toolbar = screen.getByRole('toolbar', { name: 'C4 tools' });

    expect(
      within(toolbar)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Select (V)', 'Connect', 'Add Actor', 'Add External System', 'Auto-layout']);
    // Enterprise sets both attributes to the same string (C4Toolbar.tsx:88-89).
    for (const button of within(toolbar).getAllByRole('button')) {
      expect(button.getAttribute('title')).toBe(button.getAttribute('aria-label'));
    }
    // Floating chrome, pinned where enterprise pins its tools group.
    expect(container.querySelector('.c4-toolbar')).not.toBeNull();
    expect(container.querySelector('.c4-toolbar')).toHaveAttribute('data-canvas-ui');
  });

  it('a container diagram offers the DEPLOYMENT palette when that lens is on screen', async () => {
    await renderAuthoring('ledger', 'deployment');
    const toolbar = screen.getByRole('toolbar', { name: 'C4 tools' });
    expect(
      within(toolbar)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual([
      'Select (V)',
      'Connect',
      'Add Container',
      'Add Database',
      // Lower-case on purpose. `labelForType` has no `queue` case, so it
      // falls to its default branch — and so does enterprise's, which
      // renders the same "Add queue" (C4Toolbar.tsx via
      // `nodes/c4-node-types.ts:110-127`). Title-casing it here would be a
      // silent parity break, so the expectation pins the enterprise string.
      'Add queue',
      'Add External System',
      'Auto-layout',
    ]);
  });

  it('Auto-layout resolves the host at CLICK time, so an effect-installed host still works', async () => {
    const { calls } = await renderAuthoring('context');
    // The host is installed by `onCanvasReady`, i.e. AFTER the first render.
    // Mutation: reading `instance.host.autoLayout` during render instead
    // makes this button permanently absent (or permanently inert).
    fireEvent.click(screen.getByRole('button', { name: 'Auto-layout' }));
    expect(calls.autoLayout).toHaveBeenCalledOnce();
  });
});

// ── Place loop ──────────────────────────────────────────────────────────────
describe('place loop — palette arms the tool, a canvas click asks the host to drop a card', () => {
  it('arming shows the enterprise hint pill and a canvas click reaches placeNode at the clicked point', async () => {
    const { container, calls } = await renderAuthoring('context');

    const addActor = screen.getByRole('button', { name: 'Add Actor' });
    expect(addActor).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(addActor);
    expect(addActor).toHaveAttribute('aria-pressed', 'true');

    // The hint pill is the only on-screen statement of the Escape rule.
    const hint = container.querySelector('.c4-place-hint') as HTMLElement;
    expect(hint).toHaveTextContent('Click to place Actor');
    expect(hint).toHaveTextContent('Esc to cancel');

    clickAt(canvasRoot(container), { clientX: 640, clientY: 400 });

    expect(calls.placeNode).toHaveBeenCalledOnce();
    // PAGE coordinates, and the point the user actually clicked — this is
    // the assertion that catches a double screen→page conversion.
    expect(calls.placeNode).toHaveBeenCalledWith('actor', { x: 640, y: 400 });
  });

  it('clicking the armed type again disarms it back to Select (enterprise toggle-off)', async () => {
    const { container, instance, calls } = await renderAuthoring('context');
    const addActor = screen.getByRole('button', { name: 'Add Actor' });

    fireEvent.click(addActor);
    fireEvent.click(addActor);

    expect(instance.getState().activeTool).toBe('select');
    expect(container.querySelector('.c4-place-hint')).toBeNull();
    clickAt(canvasRoot(container), { clientX: 640, clientY: 400 });
    expect(calls.placeNode).not.toHaveBeenCalled();
  });
});

// ── Connector loop ──────────────────────────────────────────────────────────
describe('connector loop — dragging between two cards asks the host to create the relation', () => {
  it('drags architect → gateway and calls createEdge with the two element slugs', async () => {
    const { container, diagram, calls } = await renderAuthoring('context');
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    const root = canvasRoot(container);
    const from = centerOf(diagram, 'architect');
    const to = centerOf(diagram, 'gateway');
    firePointer(root, 'pointerdown', from);
    firePointer(root, 'pointermove', to);
    firePointer(root, 'pointerup', to);

    // `connectorKey` for a c4node is its slug — the diagram's node key, the
    // same identity `POST /api/relations` takes for `from`/`to`.
    expect(calls.createEdge).toHaveBeenCalledWith('architect', 'gateway');
  });
});

// ── Context menu ────────────────────────────────────────────────────────────
describe('context menu — the shared menu, plus the C4 Rename row', () => {
  it('right-clicking a card offers Rename above the menu’s own Delete', async () => {
    const { container, diagram } = await renderAuthoring('context');
    rightClickAt(canvasRoot(container), centerOf(diagram, 'architect'));

    expect(screen.getByRole('button', { name: 'Rename' })).toBeInTheDocument();
    // The shared menu still composes everything enterprise's C4 menu shows.
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bring to Front' })).toBeInTheDocument();
  });

  it('Rename opens the inline editor and committing reaches renameNode', async () => {
    const { container, diagram, calls } = await renderAuthoring('context');
    rightClickAt(canvasRoot(container), centerOf(diagram, 'architect'));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Rename' }));

    const input = await screen.findByDisplayValue('Architect');
    fireEvent.change(input, { target: { value: 'Principal Architect' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);

    expect(calls.renameNode).toHaveBeenCalledWith('architect', 'Principal Architect');
  });

  it('Rename on a CONNECTOR opens the edge-label editor and commits through renameEdge', async () => {
    const { container, calls } = await renderAuthoring('context');
    // Right-click ON the edge, at the point the layer itself put the edge's
    // label — i.e. a coordinate the render produced, not one hard-coded
    // against a layout that could change.
    rightClickAt(canvasRoot(container), labelPointOf(container, 'designs systems in'));

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Rename' }));
    const input = await screen.findByDisplayValue('designs systems in');
    fireEvent.change(input, { target: { value: 'reviews' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);

    // The endpoints are the RESOLVED slugs the projection put on the
    // connector (`__system__` resolves to the system element, "ledger") —
    // the same identity `PATCH /api/relations` keys on.
    expect(calls.renameEdge).toHaveBeenCalledWith('architect', 'ledger', 'reviews');
  });
});

// ── Element editor entry point ──────────────────────────────────────────────
// #133 ledger: the editor is where tree-wide deletion lives, so it has to be
// REACHABLE. Mutation: reverting `editorHandle` in c4-node-component.tsx to
// the bare `artifactRefId` gate makes the first test fail — the studio's
// projection sets no `artifactRefId`, so the double-click silently no-ops.
describe('element editor — double-clicking a card opens it on a file-backed host', () => {
  it('passes the element slug as the handle', async () => {
    const { calls } = await renderAuthoring('context');
    fireEvent.doubleClick(cardOf(/actor: Architect/i));

    expect(calls.openElementEditor).toHaveBeenCalledOnce();
    expect(calls.openElementEditor.mock.calls[0]?.[0]).toMatchObject({
      artifactRefId: 'architect',
      slug: 'architect',
      label: 'Architect',
    });
  });

  it('does NOT open for the resolver-INJECTED __system__ card — no node entry, no file to edit', async () => {
    const { calls } = await renderAuthoring('context');
    fireEvent.doubleClick(cardOf(/system: Ledger/i));
    expect(calls.openElementEditor).not.toHaveBeenCalled();
  });
});

// ── Escape precedence (#133 ledger acceptance) ──────────────────────────────
// The documented order is: inline editor (swallows at the input) → context
// menu → editingId → PLACE MODE → clear selection / dismiss the rail.
//
// Mutations that kill these: deleting the `activeTool === 'place'` branch
// (test 1 — the rail clears while placement stays armed); deleting either
// `event.stopPropagation()` (test 1's rail assertion, via the explorer suite
// contract that Escape on the root clears the rail); deleting the `editingId`
// branch (test 3).
describe('Escape precedence — place-mode cancel outranks dismissing the detail rail', () => {
  it('cancels placement FIRST and leaves the selection (and therefore the rail) alone', async () => {
    const { container, diagram, instance, onSelect } = await renderAuthoring('context');
    clickAt(canvasRoot(container), centerOf(diagram, 'architect'));
    onSelect.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Add Actor' }));
    expect(instance.getState().activeTool).toBe('place');

    fireEvent.keyDown(outerOf(container), { key: 'Escape' });

    expect(instance.getState().activeTool).toBe('select');
    // The rail survives: the placement was the in-flight operation.
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('a SECOND Escape, with nothing in flight, clears the selection and dismisses the rail', async () => {
    const { container, diagram, instance, onSelect } = await renderAuthoring('context');
    clickAt(canvasRoot(container), centerOf(diagram, 'architect'));
    fireEvent.click(screen.getByRole('button', { name: 'Add Actor' }));
    fireEvent.keyDown(outerOf(container), { key: 'Escape' });
    onSelect.mockClear();

    fireEvent.keyDown(outerOf(container), { key: 'Escape' });

    expect(onSelect).toHaveBeenCalledWith(null);
    expect(instance.getState().selectedIds.size).toBe(0);
  });

  it('an open inline editor outranks both: Escape leaves edit mode, selection untouched', async () => {
    const { container, diagram, instance, onSelect } = await renderAuthoring('context');
    rightClickAt(canvasRoot(container), centerOf(diagram, 'architect'));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Rename' }));
    await screen.findByDisplayValue('Architect');
    onSelect.mockClear();

    fireEvent.keyDown(outerOf(container), { key: 'Escape' });

    expect(instance.getState().editingId).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });
});

// ── Backspace / Delete typing guard (#133 ledger acceptance) ────────────────
// Three independent locks, one test each. Every one of them is a real
// mutation target because the failure mode — a user backspacing through a
// name and destroying the node instead — is silent and destructive.
describe('Backspace never reaches the delete branch while text is being edited', () => {
  it('LOCK 1: the inline editor stops the key at the input — it never reaches the canvas at all', async () => {
    const { container, diagram, instance, calls } = await renderAuthoring('context');
    rightClickAt(canvasRoot(container), centerOf(diagram, 'architect'));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Rename' }));
    const input = await screen.findByDisplayValue('Architect');

    // Backspace is the case that matters, but locks 2 and 3 would stop it
    // anyway — asserting only on `deleteShapes` here would silently be
    // testing THEM. So the isolating probe is an ARROW key: the container
    // pans the camera on it, and nothing else guards that. If the editor
    // stops propagating, the camera cannot move while you are typing.
    // MUTATION: remove `e.stopPropagation()` from `LabelEditor.onKeyDown`
    // (c4-node-component.tsx) and the camera pans mid-rename.
    const before = instance.getState().camera;
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    expect(instance.getState().camera).toEqual(before);

    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(calls.deleteShapes).not.toHaveBeenCalled();
  });

  it('LOCK 2: the canvas branch refuses while an edit session is open', async () => {
    const { container, diagram, instance, calls } = await renderAuthoring('context');
    instance.getState().select([nodeShapeId('architect')], 'replace');
    rightClickAt(canvasRoot(container), centerOf(diagram, 'architect'));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Rename' }));
    await screen.findByDisplayValue('Architect');

    // Fired on the CONTAINER, bypassing lock 1 entirely. MUTATION: remove
    // the `store.editingId !== null` guard from the Delete/Backspace branch
    // in c4-diagram.tsx and this fails.
    fireEvent.keyDown(outerOf(container), { key: 'Backspace' });

    expect(calls.deleteShapes).not.toHaveBeenCalled();
  });

  it('LOCK 3: the canvas branch refuses any editable event target', async () => {
    const { container, instance, calls } = await renderAuthoring('context');
    instance.getState().select([nodeShapeId('architect')], 'replace');

    // An input inside the canvas subtree with NO edit session open — the
    // element-editor case. MUTATION: remove the INPUT/TEXTAREA/
    // contentEditable check from the branch and this fails.
    const probe = document.createElement('input');
    outerOf(container).appendChild(probe);
    fireEvent.keyDown(probe, { key: 'Backspace' });

    expect(calls.deleteShapes).not.toHaveBeenCalled();
  });

  it('…but Delete on the canvas itself, with nothing being edited, still deletes', async () => {
    const { container, instance, calls } = await renderAuthoring('context');
    instance.getState().select([nodeShapeId('architect')], 'replace');

    fireEvent.keyDown(outerOf(container), { key: 'Backspace' });

    await waitFor(() => {
      expect(calls.deleteShapes).toHaveBeenCalledOnce();
    });
  });
});
