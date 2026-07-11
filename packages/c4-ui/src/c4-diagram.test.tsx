import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { layoutDiagram } from '@workspec/c4-layout';
import type { PositionedDiagram, PositionedNode } from '@workspec/c4-layout';
import type { C4Model, ResolvedDiagram } from '@workspec/c4-model';
import { THEME_TOKENS } from '@workspec/design';
import { C4Diagram } from './c4-diagram.js';
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

/** A one-node diagram whose sole node never resolved to an element (`slug: null`, `dangling: true`) — shared by the "no resolved slug" onNavigate/onSelect tests below. */
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
  it('renders every node title and kind from the loaded model', async () => {
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

  it('renders orthogonal edges with their category label', async () => {
    const { resolved, diagram } = await loadContext();
    render(<C4Diagram diagram={diagram} resolved={resolved} />);
    expect(screen.getByText('designs systems in')).toBeInTheDocument();
    expect(screen.getByText('settles invoices via')).toBeInTheDocument();
  });

  it('carries each node’s resolved accent as the --c4-el-accent-raw custom property (the Enterprise .c4-el pattern)', async () => {
    const { resolved, diagram } = await loadContext();
    render(<C4Diagram diagram={diagram} resolved={resolved} />);
    const architect = screen.getByRole('button', { name: /actor: Architect/i });
    // The actor default accent from style/spec-defaults.ts — a @workspec/design token
    // reference now (Site Review UX pass, finding 01/02), not the raw Enterprise hex.
    expect(architect.style.getPropertyValue('--c4-el-accent-raw')).toBe('var(--el-actor)');
  });
});

describe('C4Diagram — hover/focus affordances', () => {
  it('hover adds the c4-node-hover class and renders the affordance ring; leaving removes both', async () => {
    const { resolved, diagram } = await loadContext();
    render(<C4Diagram diagram={diagram} resolved={resolved} />);
    const node = screen.getByRole('button', { name: /actor: Architect/i });

    expect(node.querySelector('.c4-node-ring')).toBeNull();
    fireEvent.pointerEnter(node);
    expect(node).toHaveClass('c4-node-hover');
    expect(node.querySelector('.c4-node-ring')).not.toBeNull();

    fireEvent.pointerLeave(node);
    expect(node).not.toHaveClass('c4-node-hover');
    expect(node.querySelector('.c4-node-ring')).toBeNull();
  });

  it('keyboard focus adds the c4-node-focus class and renders the ring on the node itself; blur removes them', async () => {
    const { resolved, diagram } = await loadContext();
    render(<C4Diagram diagram={diagram} resolved={resolved} />);
    const node = screen.getByRole('button', { name: /system: Ledger/i });

    // fireEvent.focus rather than node.focus(): jsdom's programmatic focus()
    // on SVG elements doesn't reliably dispatch the focus event the
    // component's onFocus listens for.
    fireEvent.focus(node);
    expect(node).toHaveClass('c4-node-focus');
    expect(node.querySelector('.c4-node-ring')).not.toBeNull();

    fireEvent.blur(node);
    expect(node).not.toHaveClass('c4-node-focus');
    expect(node.querySelector('.c4-node-ring')).toBeNull();
  });
});

describe('C4Diagram — hover tooltip', () => {
  it('shows title/kind/description/technology/tags on hover and hides them on leave', async () => {
    const { resolved, diagram } = await loadContext();
    render(<C4Diagram diagram={diagram} resolved={resolved} />);

    const architectNode = screen.getByRole('button', { name: /actor: Architect/i });
    expect(
      screen.queryByText('Designs systems and reviews proposed changes.'),
    ).not.toBeInTheDocument();

    fireEvent.pointerEnter(architectNode);
    expect(screen.getByText('Designs systems and reviews proposed changes.')).toBeInTheDocument();
    expect(screen.getByText('human')).toBeInTheDocument();

    fireEvent.pointerLeave(architectNode);
    expect(
      screen.queryByText('Designs systems and reviews proposed changes.'),
    ).not.toBeInTheDocument();
  });

  it('shows an inert Links label when no linkResolver is supplied, and an active one when the host resolves it', async () => {
    const { resolved, diagram, model } = await loadContext();
    const elementsByKindAndSlug = new Map(
      Array.from(
        model.elements.actor,
        ([slug, element]) => [elementKey('actor', slug), element] as const,
      ),
    );

    const { rerender } = render(
      <C4Diagram
        diagram={diagram}
        resolved={resolved}
        elementsByKindAndSlug={elementsByKindAndSlug}
      />,
    );
    fireEvent.pointerEnter(screen.getByRole('button', { name: /actor: Architect/i }));
    const inertLabel = screen.getByText('README.md');
    expect(inertLabel.closest('a, button')).toBeNull();

    const resolvedHost: C4StudioHost = {
      capabilities: { editLayout: false },
      linkResolver: () => ({ resolved: true, href: 'https://example.com/readme' }),
    };
    rerender(
      <C4Diagram
        diagram={diagram}
        resolved={resolved}
        host={resolvedHost}
        elementsByKindAndSlug={elementsByKindAndSlug}
      />,
    );
    fireEvent.pointerEnter(screen.getByRole('button', { name: /actor: Architect/i }));
    const activeLink = screen.getByText('README.md').closest('a');
    expect(activeLink).toHaveAttribute('href', 'https://example.com/readme');
  });

  it('clamps the tooltip position for a far-right/bottom-edge node so it cannot overflow the canvas', async () => {
    const { resolved } = await loadContext();
    const farNode = {
      nodeId: 'far',
      slug: 'far',
      kind: 'container' as const,
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
    fireEvent.pointerEnter(screen.getByRole('button', { name: /Far Edge/i }));

    const tooltip = container.querySelector('.c4-tooltip') as HTMLElement;
    expect(tooltip).not.toBeNull();
    const left = Number.parseFloat(tooltip.style.left);
    const top = Number.parseFloat(tooltip.style.top);
    expect(left).toBeLessThanOrEqual(78);
    expect(top).toBeLessThanOrEqual(96);
    // Sanity: the unclamped anchor for this node WOULD be past the ceiling
    // (x=4000 of a ~4380-wide viewBox ≈ 92%) — the clamp is doing real work.
    expect(left).toBe(78);
  });
});

describe('C4Diagram — drill-down', () => {
  it('calls onNavigate with the resolved slug on click', async () => {
    const { resolved, diagram } = await loadContext();
    const onNavigate = vi.fn();
    render(<C4Diagram diagram={diagram} resolved={resolved} onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole('button', { name: /system: Ledger/i }));
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
    render(<C4Diagram diagram={diagram} resolved={resolved} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: /Unresolved/i }));
    expect(onNavigate).not.toHaveBeenCalled();
  });
});

describe('C4Diagram — click-to-select (independent of drill-down)', () => {
  it('clicking a node calls onSelect with that node — onNavigate need not even be supplied', async () => {
    const { resolved, diagram } = await loadContext();
    const onSelect = vi.fn();
    render(<C4Diagram diagram={diagram} resolved={resolved} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('button', { name: /system: Ledger/i }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]?.[0]).toMatchObject({ nodeId: 'ledger', slug: 'ledger' });
  });

  it('a click fires BOTH onSelect and onNavigate when both are supplied — two independent effects from one click', async () => {
    const { resolved, diagram } = await loadContext();
    const onSelect = vi.fn();
    const onNavigate = vi.fn();
    render(
      <C4Diagram
        diagram={diagram}
        resolved={resolved}
        onSelect={onSelect}
        onNavigate={onNavigate}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /system: Ledger/i }));
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

  it('a node with no resolved slug is still selectable (interactive, not aria-disabled) when onSelect is supplied, even though onNavigate never fires for it', () => {
    const onSelect = vi.fn();
    const { diagram, resolved } = unresolvedNodeFixture();
    render(<C4Diagram diagram={diagram} resolved={resolved} onSelect={onSelect} />);

    const node = screen.getByRole('button', { name: /Unresolved/i });
    expect(node).toHaveAttribute('aria-disabled', 'false');
    fireEvent.click(node);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('a plain click on the canvas background (no drag) calls onSelect(null), clearing the selection', async () => {
    const { resolved, diagram } = await loadContext();
    const onSelect = vi.fn();
    const { container } = render(
      <C4Diagram diagram={diagram} resolved={resolved} onSelect={onSelect} />,
    );
    const svg = container.querySelector('svg.c4-canvas') as SVGSVGElement;

    firePointer(svg, 'pointerdown', { clientX: 50, clientY: 50 });
    firePointer(svg, 'pointerup', { clientX: 50, clientY: 50 });
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('a real pan drag on the background does NOT call onSelect(null) — only a click-without-movement clears', async () => {
    const { resolved, diagram } = await loadContext();
    const onSelect = vi.fn();
    const { container } = render(
      <C4Diagram diagram={diagram} resolved={resolved} onSelect={onSelect} />,
    );
    const svg = container.querySelector('svg.c4-canvas') as SVGSVGElement;

    firePointer(svg, 'pointerdown', { clientX: 0, clientY: 0 });
    firePointer(svg, 'pointermove', { clientX: 200, clientY: 200 });
    firePointer(svg, 'pointerup', { clientX: 200, clientY: 200 });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('a node click never reaches the background handler (no stray onSelect(null) from the same click)', async () => {
    // Regression guard for the propagation fix in onNodePointerDown/Up:
    // clicking a node used to leave its pointerdown/up free to bubble to
    // the SVG background in the non-editable path (nothing consumed it
    // before there was background behaviour to trigger) — which would now
    // sneak in a spurious onSelect(null) around the node's own onSelect(node).
    const { resolved, diagram } = await loadContext();
    const onSelect = vi.fn();
    render(<C4Diagram diagram={diagram} resolved={resolved} onSelect={onSelect} />);

    const node = screen.getByRole('button', { name: /system: Ledger/i });
    firePointer(node, 'pointerdown', { clientX: 10, clientY: 10 });
    firePointer(node, 'pointerup', { clientX: 10, clientY: 10 });
    expect(onSelect).not.toHaveBeenCalledWith(null);
  });

  it('with an EDITABLE host (editLayout + source): a plain click selects, a real drag does not touch the selection', async () => {
    // The editable path routes clicks through the pointer drag-vs-click
    // detection (onNodePointerUp) instead of the plain onClick handler —
    // selection must behave identically there: a no-movement click
    // activates (selects), a real drag writes layout WITHOUT selecting.
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
    render(<C4Diagram diagram={diagram} resolved={resolved} host={host} onSelect={onSelect} />);
    const node = screen.getByRole('button', { name: /system: Ledger/i });

    // A real drag: no selection change at all.
    firePointer(node, 'pointerdown', { clientX: 0, clientY: 0 });
    firePointer(node, 'pointermove', { clientX: 200, clientY: 0 });
    firePointer(node, 'pointerup', { clientX: 200, clientY: 0 });
    expect(onSelect).not.toHaveBeenCalled();

    // A plain click (no meaningful movement): selects the node.
    firePointer(node, 'pointerdown', { clientX: 10, clientY: 10 });
    firePointer(node, 'pointerup', { clientX: 10, clientY: 10 });
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

  it('selectedNodeId renders the persistent selection ring on the matching node, and nothing on others', async () => {
    const { resolved, diagram } = await loadContext();
    render(<C4Diagram diagram={diagram} resolved={resolved} selectedNodeId="ledger" />);

    const selectedNode = screen.getByRole('button', { name: /system: Ledger/i });
    expect(selectedNode).toHaveClass('c4-node-selected');
    expect(selectedNode.querySelector('.c4-node-ring-selected-inner')).not.toBeNull();
    expect(selectedNode.querySelector('.c4-node-ring-selected-outer')).not.toBeNull();

    const otherNode = screen.getByRole('button', { name: /actor: Architect/i });
    expect(otherNode).not.toHaveClass('c4-node-selected');
    expect(otherNode.querySelector('.c4-node-ring-selected-inner')).toBeNull();
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
    render(<C4Diagram diagram={diagram} resolved={resolved} host={host} onNavigate={onNavigate} />);

    const node = screen.getByRole('button', { name: /system: Ledger/i });
    firePointer(node, 'pointerdown', { clientX: 0, clientY: 0 });
    firePointer(node, 'pointermove', { clientX: 100, clientY: 100 });
    firePointer(node, 'pointerup', { clientX: 100, clientY: 100 });
    expect(writeFile).not.toHaveBeenCalled();

    fireEvent.click(node);
    expect(onNavigate).toHaveBeenCalledWith('ledger');
  });

  it('a drag does nothing when editLayout is true but no source is supplied', async () => {
    const { resolved, diagram } = await loadContext();
    const host: C4StudioHost = { capabilities: { editLayout: true } };
    render(<C4Diagram diagram={diagram} resolved={resolved} host={host} />);

    const node = screen.getByRole('button', { name: /system: Ledger/i });
    firePointer(node, 'pointerdown', { clientX: 0, clientY: 0 });
    firePointer(node, 'pointermove', { clientX: 100, clientY: 100 });
    firePointer(node, 'pointerup', { clientX: 100, clientY: 100 });
    // No source means nothing to assert a write against — this just proves
    // dragging didn't throw with a half-granted capability.
  });

  it('a real drag moves the node and writes the serialized layout back through the source, and suppresses drill-down', async () => {
    const { resolved, diagram } = await loadContext();
    const onNavigate = vi.fn();
    const host: C4StudioHost = { capabilities: { editLayout: true }, source };
    render(<C4Diagram diagram={diagram} resolved={resolved} host={host} onNavigate={onNavigate} />);

    const node = screen.getByRole('button', { name: /system: Ledger/i });
    firePointer(node, 'pointerdown', { clientX: 0, clientY: 0 });
    firePointer(node, 'pointermove', { clientX: 200, clientY: 0 });
    firePointer(node, 'pointerup', { clientX: 200, clientY: 0 });

    expect(writeFile).toHaveBeenCalledTimes(1);
    const [path, content] = writeFile.mock.calls[0] as [string, string];
    expect(path).toBe('.workspec/diagrams/.layout/context.yaml');
    expect(content).toContain('ledger:');
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('a click with no meaningful movement still drills down when editLayout is true', async () => {
    const { resolved, diagram } = await loadContext();
    const onNavigate = vi.fn();
    const host: C4StudioHost = { capabilities: { editLayout: true }, source };
    render(<C4Diagram diagram={diagram} resolved={resolved} host={host} onNavigate={onNavigate} />);

    const node = screen.getByRole('button', { name: /system: Ledger/i });
    firePointer(node, 'pointerdown', { clientX: 10, clientY: 10 });
    firePointer(node, 'pointerup', { clientX: 10, clientY: 10 });
    expect(onNavigate).toHaveBeenCalledWith('ledger');
    expect(writeFile).not.toHaveBeenCalled();
  });
});

describe('C4Diagram — pan/zoom/keyboard', () => {
  function getTransform(container: HTMLElement): string {
    const g = within(container).getByRole('group').querySelector('g[transform]');
    return g?.getAttribute('transform') ?? '';
  }

  it('arrow keys pan the camera (the content transform changes)', async () => {
    const { resolved, diagram } = await loadContext();
    const { container } = render(<C4Diagram diagram={diagram} resolved={resolved} />);
    const before = getTransform(container);
    const outer = container.querySelector('.c4-diagram') as HTMLElement;
    fireEvent.keyDown(outer, { key: 'ArrowRight' });
    expect(getTransform(container)).not.toBe(before);
    expect(getTransform(container)).toContain('translate(-40 0)');
  });

  it('+/- keys zoom the camera', async () => {
    const { resolved, diagram } = await loadContext();
    const { container } = render(<C4Diagram diagram={diagram} resolved={resolved} />);
    const outer = container.querySelector('.c4-diagram') as HTMLElement;
    fireEvent.keyDown(outer, { key: '+' });
    expect(getTransform(container)).toContain('scale(1.2)');
    fireEvent.keyDown(outer, { key: '-' });
    expect(getTransform(container)).toContain('scale(1)');
  });

  it('wheel zooms the canvas', async () => {
    const { resolved, diagram } = await loadContext();
    const { container } = render(<C4Diagram diagram={diagram} resolved={resolved} />);
    const svg = container.querySelector('svg.c4-canvas') as SVGSVGElement;
    fireEvent.wheel(svg, { deltaY: -100, clientX: 100, clientY: 100 });
    expect(getTransform(container)).toContain('scale(1.2)');
  });
});
