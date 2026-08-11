// The C4Diagram behavioural contract, S4 edition (#120): the same
// props/interaction/a11y semantics the pre-recomposition suite pinned, now
// exercised THROUGH the real canvas-engine pointer pipeline (events bubble
// to the canvas root's native listeners; clicks are pointerdown+up pairs
// at the node's page coordinates — jsdom rects are zero so page ==
// client at the identity camera). DOM-structure expectations moved from
// the retired SVG renderer (c4-node-* classes, viewBox transforms) to the
// enterprise card chrome (.c4-el outline/box-shadow states) and the
// engine camera (shape-wrapper transforms).

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { layoutDiagram } from '@workspec/c4-layout';
import type { PositionedDiagram, PositionedNode } from '@workspec/c4-layout';
import { Layout, parseLayoutYaml, serializeLayout } from '@workspec/c4-schema';
import type { C4Model, ResolvedDiagram } from '@workspec/c4-model';
import { THEME_TOKENS } from '@workspec/design';
import type { CanvasStoreInstance } from '@workspec/canvas';
import { C4Diagram } from './c4-diagram.js';
import { nodeShapeId } from './c4/index.js';
import { elementKey } from './element-key.js';
import type { C4StudioHost } from './host.js';
import { firePointer } from './test-helpers/fire-pointer.js';
import { loadSyntheticModel } from './test-helpers/synthetic-model.js';

async function loadContext(): Promise<{
  model: C4Model;
  resolved: ResolvedDiagram;
  diagram: PositionedDiagram;
}> {
  const model = await loadSyntheticModel();
  const resolved = model.diagrams.find((d) => d.slug === 'context');
  if (!resolved || !resolved.view) throw new Error('fixture missing the context diagram');
  const diagram = await layoutDiagram({
    nodes: resolved.view.nodes,
    edges: resolved.view.edges,
    layout: null,
  });
  return { model, resolved, diagram };
}

function readOnlyHost(): C4StudioHost {
  return { capabilities: { editLayout: false } };
}

/** The node's page-centre — where a pointer gesture must land to hit it (identity camera, zero rects). */
function centerOf(
  diagram: PositionedDiagram,
  nodeId: string,
): { clientX: number; clientY: number } {
  const node = diagram.nodes.find((n) => n.nodeId === nodeId);
  if (!node) throw new Error(`node ${nodeId} missing`);
  return { clientX: node.x + node.width / 2, clientY: node.y + node.height / 2 };
}

/** The canvas engine root (pointer listeners live here; events from children bubble to it). */
function canvasRoot(container: HTMLElement): Element {
  const root = container.querySelector('[data-canvas-root]');
  if (!root) throw new Error('canvas root missing');
  return root;
}

/** A pointerdown+up pair with no movement — the pipeline's "click". */
function clickAt(target: Element, at: { clientX: number; clientY: number }): void {
  firePointer(target, 'pointerdown', at);
  firePointer(target, 'pointerup', at);
}

/** The enterprise card element (.c4-el) inside a node's a11y wrapper. */
function cardOf(node: HTMLElement): HTMLElement {
  const card = node.querySelector('.c4-el');
  if (!card) throw new Error('card missing');
  return card as HTMLElement;
}

/** A one-node diagram whose sole node never resolved to an element (`slug: null`, `dangling: true`). */
function unresolvedNodeFixture(): { diagram: PositionedDiagram; resolved: ResolvedDiagram } {
  const node: PositionedNode = {
    nodeId: 'x',
    slug: null,
    kind: 'container',
    title: 'Unresolved',
    description: null,
    technology: null,
    tags: [],
    position: null,
    injected: false,
    dangling: true,
    x: 0,
    y: 0,
    width: 300,
    height: 110,
    pinned: false,
  };
  const diagram: PositionedDiagram = { nodes: [node], edges: [] };
  const resolved: ResolvedDiagram = {
    slug: 'x-diagram',
    path: '.workspec/diagrams/x-diagram.yaml',
    title: 'X',
    type: 'c4-context',
    description: null,
    raw: { title: 'X', type: 'c4-context', nodes: [], edges: [] },
    view: { nodes: diagram.nodes, edges: [] },
    lensViews: null,
    layout: null,
  };
  return { diagram, resolved };
}

describe('C4Diagram — representative fixture render', () => {
  it('renders every node title and kind from the loaded model as role=button cards', async () => {
    const { resolved, diagram } = await loadContext();
    render(<C4Diagram diagram={diagram} resolved={resolved} host={readOnlyHost()} />);

    expect(screen.getByText('Architect')).toBeInTheDocument();
    expect(screen.getByText('Payment Gateway')).toBeInTheDocument();
    expect(screen.getByText('Ledger')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /actor: Architect/i })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /external-system: Payment Gateway/i }),
    ).toBeInTheDocument();
  });

  it('renders both themes with the matching WorkSpec token ramp on the root', async () => {
    const { resolved, diagram } = await loadContext();
    const dark = render(<C4Diagram diagram={diagram} resolved={resolved} theme="dark" />);
    const darkRoot = dark.container.querySelector('.c4-root') as HTMLElement;
    expect(darkRoot).toHaveAttribute('data-theme', 'dark');
    expect(darkRoot.style.getPropertyValue('--bg')).toBe(THEME_TOKENS['console-dark']['--bg']);
    dark.unmount();

    const light = render(<C4Diagram diagram={diagram} resolved={resolved} theme="light" />);
    const lightRoot = light.container.querySelector('.c4-root') as HTMLElement;
    expect(lightRoot).toHaveAttribute('data-theme', 'light');
    expect(lightRoot.style.getPropertyValue('--bg')).toBe(THEME_TOKENS['console-light']['--bg']);
  });

  it('renders the shared-router edges with their category labels', async () => {
    const { resolved, diagram } = await loadContext();
    const { container } = render(<C4Diagram diagram={diagram} resolved={resolved} />);
    expect(screen.getByText('designs systems in')).toBeInTheDocument();
    expect(screen.getByText('settles invoices via')).toBeInTheDocument();
    // The edges are the engine's .c4-conn groups (the enterprise treatment).
    expect(container.querySelectorAll('g.c4-conn').length).toBeGreaterThanOrEqual(2);
  });

  it('carries each node’s resolved accent as the --el-accent-raw custom property (the Enterprise .c4-el pattern)', async () => {
    const { resolved, diagram } = await loadContext();
    render(<C4Diagram diagram={diagram} resolved={resolved} />);
    const architect = screen.getByRole('button', { name: /actor: Architect/i });
    expect(cardOf(architect).style.getPropertyValue('--el-accent-raw')).toBe('var(--el-actor)');
  });
});

describe('C4Diagram — hover/focus affordances', () => {
  it('pointer hover (through the engine pipeline) shows the dashed accent outline; leaving clears it', async () => {
    const { resolved, diagram } = await loadContext();
    const { container } = render(<C4Diagram diagram={diagram} resolved={resolved} />);
    const root = canvasRoot(container);
    const node = screen.getByRole('button', { name: /actor: Architect/i });

    expect(cardOf(node).style.outline).toBe('');
    firePointer(root, 'pointermove', centerOf(diagram, 'architect'));
    expect(cardOf(node).style.outline).toContain('dashed');

    // Move onto empty canvas far from every node.
    firePointer(root, 'pointermove', { clientX: -5000, clientY: -5000 });
    expect(cardOf(node).style.outline).toBe('');
  });

  it('keyboard focus mirrors hover (the accent outline is the focus affordance); blur clears it', async () => {
    const { resolved, diagram } = await loadContext();
    render(<C4Diagram diagram={diagram} resolved={resolved} />);
    const node = screen.getByRole('button', { name: /system: Ledger/i });

    fireEvent.focus(node);
    expect(cardOf(node).style.outline).toContain('dashed');

    fireEvent.blur(node);
    expect(cardOf(node).style.outline).toBe('');
  });
});

describe('C4Diagram — hover tooltip', () => {
  it('shows the tooltip (kind/description/technology) on hover and hides it on leave', async () => {
    // NOTE: the enterprise card renders the description ON the card too —
    // tooltip assertions scope to the .c4-tooltip container.
    const { resolved, diagram } = await loadContext();
    const { container } = render(<C4Diagram diagram={diagram} resolved={resolved} />);
    const root = canvasRoot(container);

    expect(container.querySelector('.c4-tooltip')).toBeNull();

    firePointer(root, 'pointermove', centerOf(diagram, 'architect'));
    const tooltip = container.querySelector('.c4-tooltip') as HTMLElement;
    expect(tooltip).not.toBeNull();
    expect(tooltip.textContent).toContain('Designs systems and reviews proposed changes.');
    expect(tooltip.textContent).toContain('human');

    firePointer(root, 'pointermove', { clientX: -5000, clientY: -5000 });
    expect(container.querySelector('.c4-tooltip')).toBeNull();
  });

  it('shows an inert Links label when no linkResolver is supplied, and an active one when the host resolves it', async () => {
    const { resolved, diagram, model } = await loadContext();
    const elementsByKindAndSlug = new Map(
      Array.from(
        model.elements.actor,
        ([slug, element]) => [elementKey('actor', slug), element] as const,
      ),
    );

    const first = render(
      <C4Diagram
        diagram={diagram}
        resolved={resolved}
        elementsByKindAndSlug={elementsByKindAndSlug}
      />,
    );
    firePointer(canvasRoot(first.container), 'pointermove', centerOf(diagram, 'architect'));
    const inertLabel = screen.getByText('README.md');
    expect(inertLabel.closest('a, button')).toBeNull();

    const resolvedHost: C4StudioHost = {
      capabilities: { editLayout: false },
      linkResolver: () => ({ resolved: true, href: 'https://example.com/readme' }),
    };
    first.rerender(
      <C4Diagram
        diagram={diagram}
        resolved={resolved}
        host={resolvedHost}
        elementsByKindAndSlug={elementsByKindAndSlug}
      />,
    );
    firePointer(canvasRoot(first.container), 'pointermove', centerOf(diagram, 'architect'));
    const activeLink = screen.getByText('README.md').closest('a');
    expect(activeLink).toHaveAttribute('href', 'https://example.com/readme');
  });

  it('clamps the tooltip position so it cannot overflow the canvas', async () => {
    const { resolved } = await loadContext();
    const farNode: PositionedNode = {
      nodeId: 'far',
      slug: 'far',
      kind: 'container',
      title: 'Far Edge',
      description: 'Sits at the extreme corner.',
      technology: null,
      tags: [],
      position: null,
      injected: false,
      dangling: false,
      x: 4000,
      y: 3000,
      width: 300,
      height: 110,
      pinned: false,
    };
    const nearNode = { ...farNode, nodeId: 'near', slug: 'near', title: 'Near Origin', x: 0, y: 0 };
    const diagram: PositionedDiagram = { nodes: [nearNode, farNode], edges: [] };

    const { container } = render(<C4Diagram diagram={diagram} resolved={resolved} />);
    firePointer(canvasRoot(container), 'pointermove', centerOf(diagram, 'far'));

    const tooltip = container.querySelector('.c4-tooltip') as HTMLElement;
    expect(tooltip).not.toBeNull();
    const left = Number.parseFloat(tooltip.style.left);
    const top = Number.parseFloat(tooltip.style.top);
    // jsdom's unmeasurable canvas makes the raw anchor astronomically far
    // past the ceiling — the shared clamp must cap it at exactly 78/96.
    expect(left).toBe(78);
    expect(top).toBe(96);
  });
});

describe('C4Diagram — drill-down', () => {
  it('calls onNavigate with the resolved slug on click (through the pointer pipeline)', async () => {
    const { resolved, diagram } = await loadContext();
    const onNavigate = vi.fn();
    const { container } = render(
      <C4Diagram diagram={diagram} resolved={resolved} onNavigate={onNavigate} />,
    );
    clickAt(canvasRoot(container), centerOf(diagram, 'ledger'));
    expect(onNavigate).toHaveBeenCalledWith('ledger');
  });

  it('calls onNavigate on Enter when a node is focused', async () => {
    const { resolved, diagram } = await loadContext();
    const onNavigate = vi.fn();
    render(<C4Diagram diagram={diagram} resolved={resolved} onNavigate={onNavigate} />);

    const node = screen.getByRole('button', { name: /external-system: Payment Gateway/i });
    node.focus();
    fireEvent.keyDown(node, { key: 'Enter' });
    expect(onNavigate).toHaveBeenCalledWith('gateway');
  });

  it('does not call onNavigate for a node with no resolved slug', () => {
    const onNavigate = vi.fn();
    const { diagram, resolved } = unresolvedNodeFixture();
    const { container } = render(
      <C4Diagram diagram={diagram} resolved={resolved} onNavigate={onNavigate} />,
    );
    clickAt(canvasRoot(container), centerOf(diagram, 'x'));
    expect(onNavigate).not.toHaveBeenCalled();
  });
});

describe('C4Diagram — click-to-select (independent of drill-down)', () => {
  it('clicking a node calls onSelect with that node — onNavigate need not even be supplied', async () => {
    const { resolved, diagram } = await loadContext();
    const onSelect = vi.fn();
    const { container } = render(
      <C4Diagram diagram={diagram} resolved={resolved} onSelect={onSelect} />,
    );
    clickAt(canvasRoot(container), centerOf(diagram, 'ledger'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]?.[0]).toMatchObject({ nodeId: 'ledger', slug: 'ledger' });
  });

  it('a click fires BOTH onSelect and onNavigate when both are supplied', async () => {
    const { resolved, diagram } = await loadContext();
    const onSelect = vi.fn();
    const onNavigate = vi.fn();
    const { container } = render(
      <C4Diagram
        diagram={diagram}
        resolved={resolved}
        onSelect={onSelect}
        onNavigate={onNavigate}
      />,
    );
    clickAt(canvasRoot(container), centerOf(diagram, 'ledger'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith('ledger');
  });

  it('Enter on a focused node also selects (not just drills)', async () => {
    const { resolved, diagram } = await loadContext();
    const onSelect = vi.fn();
    render(<C4Diagram diagram={diagram} resolved={resolved} onSelect={onSelect} />);

    const node = screen.getByRole('button', { name: /external-system: Payment Gateway/i });
    node.focus();
    fireEvent.keyDown(node, { key: 'Enter' });
    expect(onSelect.mock.calls[0]?.[0]).toMatchObject({ nodeId: 'gateway' });
  });

  it('a node with no resolved slug is still selectable (interactive, not aria-disabled) when onSelect is supplied', () => {
    const onSelect = vi.fn();
    const { diagram, resolved } = unresolvedNodeFixture();
    const { container } = render(
      <C4Diagram diagram={diagram} resolved={resolved} onSelect={onSelect} />,
    );

    const node = screen.getByRole('button', { name: /Unresolved/i });
    expect(node).toHaveAttribute('aria-disabled', 'false');
    clickAt(canvasRoot(container), centerOf(diagram, 'x'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('a plain click on the canvas background (no drag) calls onSelect(null), clearing the selection', async () => {
    const { resolved, diagram } = await loadContext();
    const onSelect = vi.fn();
    const { container } = render(
      <C4Diagram diagram={diagram} resolved={resolved} onSelect={onSelect} />,
    );
    clickAt(canvasRoot(container), { clientX: -900, clientY: -900 });
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('a real pan drag on the background does NOT call onSelect(null) — only a click-without-movement clears', async () => {
    const { resolved, diagram } = await loadContext();
    const onSelect = vi.fn();
    const { container } = render(
      <C4Diagram diagram={diagram} resolved={resolved} onSelect={onSelect} />,
    );
    const root = canvasRoot(container);
    firePointer(root, 'pointerdown', { clientX: -900, clientY: -900 });
    firePointer(root, 'pointermove', { clientX: -700, clientY: -700 });
    firePointer(root, 'pointerup', { clientX: -700, clientY: -700 });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('a node click never produces a stray onSelect(null) from the same gesture', async () => {
    const { resolved, diagram } = await loadContext();
    const onSelect = vi.fn();
    const { container } = render(
      <C4Diagram diagram={diagram} resolved={resolved} onSelect={onSelect} />,
    );
    clickAt(canvasRoot(container), centerOf(diagram, 'ledger'));
    expect(onSelect).not.toHaveBeenCalledWith(null);
  });

  it('with an EDITABLE host: a plain click selects, a real drag does not touch the selection', async () => {
    const { resolved, diagram } = await loadContext();
    const onSelect = vi.fn();
    const host: C4StudioHost = {
      capabilities: { editLayout: true },
      source: {
        listFiles: async () => [],
        readFile: async () => '',
        writeFile: async () => undefined,
        exists: async () => false,
      },
    };
    const { container } = render(
      <C4Diagram diagram={diagram} resolved={resolved} host={host} onSelect={onSelect} />,
    );
    const root = canvasRoot(container);
    const at = centerOf(diagram, 'ledger');

    // A real drag: no selection change at all.
    firePointer(root, 'pointerdown', at);
    firePointer(root, 'pointermove', { clientX: at.clientX + 200, clientY: at.clientY });
    firePointer(root, 'pointerup', { clientX: at.clientX + 200, clientY: at.clientY });
    expect(onSelect).not.toHaveBeenCalled();

    // A plain click (no meaningful movement): selects the node — at its NEW position.
    const moved = { clientX: at.clientX + 200, clientY: at.clientY };
    clickAt(root, moved);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]?.[0]).toMatchObject({ nodeId: 'ledger' });
  });

  it('Escape while the canvas container has focus calls onSelect(null)', async () => {
    const { resolved, diagram } = await loadContext();
    const onSelect = vi.fn();
    const { container } = render(
      <C4Diagram diagram={diagram} resolved={resolved} onSelect={onSelect} />,
    );
    const outer = container.querySelector('.c4-diagram') as HTMLElement;
    fireEvent.keyDown(outer, { key: 'Escape' });
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('selectedNodeId renders the enterprise selection ring (accent box-shadow) on the matching card only', async () => {
    const { resolved, diagram } = await loadContext();
    render(<C4Diagram diagram={diagram} resolved={resolved} selectedNodeId="ledger" />);

    const selectedCard = cardOf(screen.getByRole('button', { name: /system: Ledger/i }));
    expect(selectedCard.style.boxShadow).toContain('0 0 0 2px var(--el-accent)');

    const otherCard = cardOf(screen.getByRole('button', { name: /actor: Architect/i }));
    expect(otherCard.style.boxShadow).not.toContain('0 0 0 2px var(--el-accent)');
  });
});

describe('C4Diagram — editLayout gating', () => {
  let writeFile: ReturnType<typeof vi.fn<(path: string, content: string) => Promise<void>>>;
  let source: NonNullable<C4StudioHost['source']>;

  beforeEach(() => {
    writeFile = vi.fn(async () => undefined);
    source = {
      listFiles: async () => [],
      readFile: async () => '',
      writeFile,
      exists: async () => false,
    };
  });

  it('a drag does nothing (and drilling still works via click) when editLayout is false', async () => {
    const { resolved, diagram } = await loadContext();
    const onNavigate = vi.fn();
    const host: C4StudioHost = { capabilities: { editLayout: false }, source };
    const { container } = render(
      <C4Diagram diagram={diagram} resolved={resolved} host={host} onNavigate={onNavigate} />,
    );
    const root = canvasRoot(container);
    const at = centerOf(diagram, 'ledger');

    firePointer(root, 'pointerdown', at);
    firePointer(root, 'pointermove', { clientX: at.clientX + 100, clientY: at.clientY + 100 });
    firePointer(root, 'pointerup', { clientX: at.clientX + 100, clientY: at.clientY + 100 });
    expect(writeFile).not.toHaveBeenCalled();

    // Read-only: the node did NOT move, so nearby original coords still hit
    // it (nudged >5px so the engine doesn't synthesize a double-click from
    // the two rapid gestures — which would also activate, but via the
    // double-click path this test isn't about).
    clickAt(root, { clientX: at.clientX + 8, clientY: at.clientY + 8 });
    expect(onNavigate).toHaveBeenCalledWith('ledger');
  });

  it('a drag does nothing when editLayout is true but no source is supplied', async () => {
    const { resolved, diagram } = await loadContext();
    const host: C4StudioHost = { capabilities: { editLayout: true } };
    const { container } = render(<C4Diagram diagram={diagram} resolved={resolved} host={host} />);
    const root = canvasRoot(container);
    const at = centerOf(diagram, 'ledger');
    firePointer(root, 'pointerdown', at);
    firePointer(root, 'pointermove', { clientX: at.clientX + 100, clientY: at.clientY + 100 });
    firePointer(root, 'pointerup', { clientX: at.clientX + 100, clientY: at.clientY + 100 });
    // Half-granted capability must not throw or write.
  });

  it('a real drag moves the node and writes the serialized layout back through the source, and suppresses drill-down', async () => {
    const { resolved, diagram } = await loadContext();
    const onNavigate = vi.fn();
    const host: C4StudioHost = { capabilities: { editLayout: true }, source };
    const { container } = render(
      <C4Diagram diagram={diagram} resolved={resolved} host={host} onNavigate={onNavigate} />,
    );
    const root = canvasRoot(container);
    const at = centerOf(diagram, 'ledger');

    firePointer(root, 'pointerdown', at);
    firePointer(root, 'pointermove', { clientX: at.clientX + 200, clientY: at.clientY });
    firePointer(root, 'pointerup', { clientX: at.clientX + 200, clientY: at.clientY });

    expect(writeFile).toHaveBeenCalledTimes(1);
    const [path, content] = writeFile.mock.calls[0] as [string, string];
    expect(path).toBe('.workspec/diagrams/.layout/context.yaml');
    expect(content).toContain('ledger:');
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("a drag merges into the diagram's EXISTING .layout/ data — the other lens's pins survive byte-for-byte (S4 fix round)", async () => {
    // The lens-merge contract serializeForWrite exists for (#120 bullet 2):
    // a c4-container diagram's two lenses share ONE .layout/ file, so the
    // drag-commit path must feed the diagram's CURRENT layout data into the
    // merge. A facade that passes null instead silently clobbers the other
    // lens's pins on every drag — this test renders a diagram whose
    // resolved.layout carries pins for nodes the on-screen view never
    // touches (other-lens keys) and requires them in the written payload.
    const { resolved, diagram } = await loadContext();
    const otherLensNode = { x: 1234, y: 567, width: 240, height: 120 };
    const otherLensEdge = {
      waypoints: [
        { x: 10, y: 20 },
        { x: 30, y: 20 },
      ],
    };
    const existing = Layout.parse({
      version: 1,
      nodes: { 'deploy-only-node': otherLensNode },
      edges: { 'deploy-only-node->elsewhere': otherLensEdge },
      viewport: { x: 5, y: 6, zoom: 1.5 },
    });
    const withLayout: ResolvedDiagram = {
      ...resolved,
      layout: { path: '.workspec/diagrams/.layout/context.yaml', data: existing },
    };
    const host: C4StudioHost = { capabilities: { editLayout: true }, source };
    const { container } = render(<C4Diagram diagram={diagram} resolved={withLayout} host={host} />);
    const root = canvasRoot(container);
    const at = centerOf(diagram, 'ledger');

    firePointer(root, 'pointerdown', at);
    firePointer(root, 'pointermove', { clientX: at.clientX + 200, clientY: at.clientY });
    firePointer(root, 'pointerup', { clientX: at.clientX + 200, clientY: at.clientY });

    expect(writeFile).toHaveBeenCalledTimes(1);
    const [, content] = writeFile.mock.calls[0] as [string, string];

    // Semantic check: the parsed payload still carries the other-lens pins
    // exactly, alongside the dragged view's own nodes.
    const written = parseLayoutYaml(content);
    if (!written.ok) throw new Error('written layout did not parse');
    expect(written.data.nodes['deploy-only-node']).toEqual(otherLensNode);
    expect(written.data.edges?.['deploy-only-node->elsewhere']).toEqual(otherLensEdge);
    expect(written.data.viewport).toEqual({ x: 5, y: 6, zoom: 1.5 });
    expect(written.data.nodes['ledger']).toBeDefined();

    // Byte-for-byte check: the payload contains the exact YAML block the
    // untouched pin serializes to (guards against lossy re-serialization,
    // not just key survival).
    const expectedBlock = serializeLayout(
      Layout.parse({ version: 1, nodes: { 'deploy-only-node': otherLensNode } }),
    )
      .split('\n')
      .filter((line) => line.startsWith('  ') || line.startsWith('    '))
      .join('\n');
    expect(content).toContain(expectedBlock);
  });

  it('a click with no meaningful movement still drills down when editLayout is true', async () => {
    const { resolved, diagram } = await loadContext();
    const onNavigate = vi.fn();
    const host: C4StudioHost = { capabilities: { editLayout: true }, source };
    const { container } = render(
      <C4Diagram diagram={diagram} resolved={resolved} host={host} onNavigate={onNavigate} />,
    );
    clickAt(canvasRoot(container), centerOf(diagram, 'ledger'));
    expect(onNavigate).toHaveBeenCalledWith('ledger');
    expect(writeFile).not.toHaveBeenCalled();
  });
});

describe('C4Diagram — pan/zoom/keyboard (the enterprise camera)', () => {
  /** The first shape wrapper's camera transform (translate3d(...) scale(...)). */
  function firstTransform(container: HTMLElement): string {
    const inner = container.querySelector(
      '[data-canvas-root] div[style*="translate3d"]',
    ) as HTMLElement | null;
    return inner?.style.transform ?? '';
  }

  it('arrow keys pan the camera (the card transforms shift)', async () => {
    const { resolved, diagram } = await loadContext();
    const { container } = render(<C4Diagram diagram={diagram} resolved={resolved} />);
    const before = firstTransform(container);
    const outer = container.querySelector('.c4-diagram') as HTMLElement;
    fireEvent.keyDown(outer, { key: 'ArrowRight' });
    const after = firstTransform(container);
    expect(after).not.toBe(before);
  });

  it('+/- keys zoom the camera (scale changes, clamped by the enterprise camera)', async () => {
    const { resolved, diagram } = await loadContext();
    const { container } = render(<C4Diagram diagram={diagram} resolved={resolved} />);
    const outer = container.querySelector('.c4-diagram') as HTMLElement;
    fireEvent.keyDown(outer, { key: '+' });
    expect(firstTransform(container)).toContain('scale(1.2)');
    fireEvent.keyDown(outer, { key: '-' });
    expect(firstTransform(container)).toContain('scale(1)');
  });

  it('wheel zooms the canvas about the cursor (the shipped c4-ui wheel contract)', async () => {
    const { resolved, diagram } = await loadContext();
    const { container } = render(<C4Diagram diagram={diagram} resolved={resolved} />);
    const outer = container.querySelector('.c4-diagram') as HTMLElement;
    fireEvent.wheel(outer, { deltaY: -100, clientX: 100, clientY: 100 });
    expect(firstTransform(container)).toContain('scale(1.2)');
  });
});

describe('C4Diagram — opt-in canvas chrome (A1, #131: grid / zoom / minimap)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('mounts NO chrome by default — the pre-A1 DOM (goldens/embeds byte-unchanged)', async () => {
    const { resolved, diagram } = await loadContext();
    const { container } = render(<C4Diagram diagram={diagram} resolved={resolved} />);

    expect(container.querySelector('svg pattern')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Zoom in' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Fit view' })).toBeNull();
    expect(container.querySelector('svg[width="192"]')).toBeNull();
  });

  it('backgroundVariant="dots" mounts the Background dot grid beneath the layers', async () => {
    const { resolved, diagram } = await loadContext();
    const { container } = render(
      <C4Diagram diagram={diagram} resolved={resolved} backgroundVariant="dots" />,
    );

    expect(container.querySelectorAll('svg pattern circle').length).toBeGreaterThan(0);
  });

  it('backgroundVariant="lines" mounts the line grid variant', async () => {
    const { resolved, diagram } = await loadContext();
    const { container } = render(
      <C4Diagram diagram={diagram} resolved={resolved} backgroundVariant="lines" />,
    );

    const patterns = container.querySelectorAll('svg pattern');
    expect(patterns.length).toBeGreaterThan(0);
    expect(container.querySelector('svg pattern circle')).toBeNull();
    expect(container.querySelectorAll('svg pattern path').length).toBeGreaterThan(0);
  });

  it('showZoomControls mounts the shared zoom cluster and its buttons drive the camera', async () => {
    const { resolved, diagram } = await loadContext();
    const { container } = render(
      <C4Diagram diagram={diagram} resolved={resolved} showZoomControls />,
    );

    // All four controls present…
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fit view' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset zoom to 100%' })).toBeInTheDocument();
    // …and they are LIVE against this diagram's camera. jsdom rects are
    // zero, so the measured viewport is 0×0 and zoom-in no-ops by contract
    // (no measurable rect = no-op) — assert the wiring instead through the
    // % readout, which reflects the store camera.
    const readout = screen.getByRole('button', { name: 'Reset zoom to 100%' });
    expect(readout.textContent).toBe('100%');
    const outer = container.querySelector('.c4-diagram') as HTMLElement;
    fireEvent.keyDown(outer, { key: '+' });
    expect(readout.textContent).toBe('120%');
  });

  it('showMinimap mounts the shared minimap once the canvas measures a viewport, dotted per element kind', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 800,
      height: 600,
      top: 0,
      left: 0,
      right: 800,
      bottom: 600,
      toJSON: () => ({}),
    } as DOMRect);
    const { resolved, diagram } = await loadContext();
    const { container } = render(<C4Diagram diagram={diagram} resolved={resolved} showMinimap />);

    const panelSvg = container.querySelector('svg[width="192"]');
    expect(panelSvg).not.toBeNull();
    // One dot per node (the context fixture's nodes; connectors excluded),
    // coloured by ELEMENT kind via the C4 kind resolver — the actor dot
    // carries the actor accent token, not a flat default.
    const dots = panelSvg?.querySelectorAll('rect[fill^="var(--el-"]') ?? [];
    expect(dots.length).toBe(diagram.nodes.length);
  });
});

describe('C4Diagram — minimap default-off, proven against a MEASURED viewport (A1 review: anti-vacuous)', () => {
  // The sibling "mounts NO chrome by default" case asserts the minimap is
  // absent under jsdom's all-zero rects — but the Minimap self-gates on a
  // non-zero measured viewport, so that assertion holds even if the
  // default flipped to `true`. A mutation probe confirmed it: flipping
  // `showMinimap = false` to `true` left the whole suite green (only the
  // apps/parity browser goldens, which have real rects, caught it). This
  // case mocks a real box FIRST, so the minimap WOULD mount if the default
  // were on — it is the assertion that dies on a default flip.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockMeasuredViewport(): void {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 800,
      height: 600,
      top: 0,
      left: 0,
      right: 800,
      bottom: 600,
      toJSON: () => ({}),
    } as DOMRect);
  }

  it('mounts no minimap with a measured 800×600 viewport and showMinimap omitted', async () => {
    mockMeasuredViewport();
    const { resolved, diagram } = await loadContext();
    const { container } = render(<C4Diagram diagram={diagram} resolved={resolved} />);

    expect(container.querySelector('svg[width="192"]')).toBeNull();
  });

  it('…and the SAME measured viewport does mount it with showMinimap — the control for the case above', async () => {
    mockMeasuredViewport();
    const { resolved, diagram } = await loadContext();
    const { container } = render(<C4Diagram diagram={diagram} resolved={resolved} showMinimap />);

    expect(container.querySelector('svg[width="192"]')).not.toBeNull();
  });

  it('showMinimap={false} is explicitly off under the same measured viewport', async () => {
    mockMeasuredViewport();
    const { resolved, diagram } = await loadContext();
    const { container } = render(
      <C4Diagram diagram={diagram} resolved={resolved} showMinimap={false} />,
    );

    expect(container.querySelector('svg[width="192"]')).toBeNull();
  });
});

describe('C4Diagram — onCanvasReady instance exposure (A1 review seam; A2 installs its host here)', () => {
  it('fires exactly once per mount with the live CanvasStoreInstance, already projected', async () => {
    const { resolved, diagram } = await loadContext();
    const onCanvasReady = vi.fn();
    const { rerender } = render(
      <C4Diagram diagram={diagram} resolved={resolved} onCanvasReady={onCanvasReady} />,
    );

    expect(onCanvasReady).toHaveBeenCalledTimes(1);
    const instance = onCanvasReady.mock.calls[0]?.[0] as CanvasStoreInstance;
    // A LIVE instance, not a snapshot: it carries this diagram's projected
    // shapes (so a host installed here can read/write them immediately).
    expect(Object.keys(instance.getState().shapes).length).toBeGreaterThan(0);

    // A re-render with unchanged props does NOT re-fire — the instance is
    // created once per mount and never replaced.
    rerender(<C4Diagram diagram={diagram} resolved={resolved} onCanvasReady={onCanvasReady} />);
    expect(onCanvasReady).toHaveBeenCalledTimes(1);
  });

  it('the exposed instance is the one the component renders — installing a host arms the delete gesture', async () => {
    const { resolved, diagram } = await loadContext();
    let captured: CanvasStoreInstance | null = null;
    const deleteShapes = vi.fn(() => false);
    const { container } = render(
      <C4Diagram
        diagram={diagram}
        resolved={resolved}
        onCanvasReady={(instance) => {
          captured = instance;
          instance.host = { deleteShapes };
        }}
      />,
    );
    expect(captured).not.toBeNull();

    // Delete is host-gated (see `onContainerKeyDown`): with the host this
    // callback installed, a selected node's Delete now reaches it.
    const target = diagram.nodes[0];
    if (!target) throw new Error('fixture has no nodes');
    (captured as unknown as CanvasStoreInstance)
      .getState()
      .select([nodeShapeId(target.nodeId)], 'replace');
    const outer = container.querySelector('.c4-diagram') as HTMLElement;
    fireEvent.keyDown(outer, { key: 'Delete' });

    expect(deleteShapes).toHaveBeenCalledOnce();
  });

  it('omitting onCanvasReady leaves the host un-armed — Delete stays inert for golden/embed renders', async () => {
    const { resolved, diagram } = await loadContext();
    const onSelect = vi.fn();
    const { container } = render(
      <C4Diagram
        diagram={diagram}
        resolved={resolved}
        selectedNodeId={diagram.nodes[0]?.nodeId ?? null}
        onSelect={onSelect}
      />,
    );

    const outer = container.querySelector('.c4-diagram') as HTMLElement;
    fireEvent.keyDown(outer, { key: 'Delete' });

    // No host ⇒ the key falls through: no clear-selection side effect.
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('C4Diagram — cameraFitKey gates the camera fit (A2 review: re-project always, re-frame only on a view change)', () => {
  // Zero jsdom rects make `fitCamera` return the identity camera, which
  // would make every assertion here indistinguishable from "nothing
  // happened". Give the canvas a real 800×600 box.
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 800,
      height: 600,
      top: 0,
      left: 0,
      right: 800,
      bottom: 600,
      toJSON: () => ({}),
    } as DOMRect);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Where the user parked the viewport — nothing `fitCamera` would return for this fixture. */
  const PARKED = { x: 137, y: -42, zoom: 0.61 };

  /** A new `PositionedDiagram` OBJECT carrying identical content — what a post-edit model refresh hands back. */
  function sameContentCopy(diagram: PositionedDiagram): PositionedDiagram {
    return { nodes: [...diagram.nodes], edges: [...diagram.edges] };
  }

  it('a new diagram object under the SAME key re-projects the shapes but leaves the camera alone', async () => {
    const { resolved, diagram } = await loadContext();
    const onCanvasReady = vi.fn();
    const { rerender } = render(
      <C4Diagram
        diagram={diagram}
        resolved={resolved}
        cameraFitKey="context|logical|LR"
        onCanvasReady={onCanvasReady}
      />,
    );
    const instance = onCanvasReady.mock.calls[0]?.[0] as CanvasStoreInstance;
    const fitted = instance.getState().camera;
    expect(fitted).not.toEqual(PARKED); // the camera assertion below discriminates
    instance.getState().setCamera(PARKED);
    const shapesBefore = instance.getState().shapes;

    rerender(
      <C4Diagram
        diagram={sameContentCopy(diagram)}
        resolved={resolved}
        cameraFitKey="context|logical|LR"
        onCanvasReady={onCanvasReady}
      />,
    );

    // Re-projected (a fresh shape record)…
    expect(instance.getState().shapes).not.toBe(shapesBefore);
    // …but NOT re-framed, and still the same instance.
    expect(instance.getState().camera).toEqual(PARKED);
    expect(onCanvasReady).toHaveBeenCalledTimes(1);
  });

  it('a CHANGED key re-frames within the same mount — navigation still fits', async () => {
    const { resolved, diagram } = await loadContext();
    const onCanvasReady = vi.fn();
    const { rerender } = render(
      <C4Diagram
        diagram={diagram}
        resolved={resolved}
        cameraFitKey="context|logical|LR"
        onCanvasReady={onCanvasReady}
      />,
    );
    const instance = onCanvasReady.mock.calls[0]?.[0] as CanvasStoreInstance;
    const fitted = instance.getState().camera;
    instance.getState().setCamera(PARKED);

    rerender(
      <C4Diagram
        diagram={sameContentCopy(diagram)}
        resolved={resolved}
        cameraFitKey="context|deployment|LR"
        onCanvasReady={onCanvasReady}
      />,
    );

    expect(instance.getState().camera).toEqual(fitted);
  });

  it('OMITTING cameraFitKey keeps the pre-A2 always-fit behaviour — every new diagram identity re-frames', async () => {
    const { resolved, diagram } = await loadContext();
    const onCanvasReady = vi.fn();
    const { rerender } = render(
      <C4Diagram diagram={diagram} resolved={resolved} onCanvasReady={onCanvasReady} />,
    );
    const instance = onCanvasReady.mock.calls[0]?.[0] as CanvasStoreInstance;
    const fitted = instance.getState().camera;
    instance.getState().setCamera(PARKED);

    rerender(
      <C4Diagram
        diagram={sameContentCopy(diagram)}
        resolved={resolved}
        onCanvasReady={onCanvasReady}
      />,
    );

    expect(instance.getState().camera).toEqual(fitted);
  });
});
