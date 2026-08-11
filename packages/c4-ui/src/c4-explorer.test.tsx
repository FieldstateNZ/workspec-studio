import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasStoreInstance } from '@workspec/canvas';
import type { C4StudioHost } from './host.js';
import { C4Explorer } from './c4-explorer.js';
import { firePointer } from './test-helpers/fire-pointer.js';
import { loadAmbiguousLevelModel, loadSyntheticModel } from './test-helpers/synthetic-model.js';

describe('C4Explorer — segmented level tabs + crumb (replaces the old tree nav)', () => {
  it('shows one numbered tab per canonical C4 level, derived from diagram TYPE, not file/list order', async () => {
    const model = await loadSyntheticModel();
    render(<C4Explorer model={model} />);

    const tabs = screen.getByRole('group', { name: 'C4 level' });
    expect(within(tabs).getByRole('button', { name: '1 · Context' })).toBeInTheDocument();
    expect(within(tabs).getByRole('button', { name: '2 · Container' })).toBeInTheDocument();
    expect(within(tabs).getByRole('button', { name: '3 · Component' })).toBeInTheDocument();

    // The default selection is the FIRST LEVEL TAB (lowest-numbered
    // canonical level present), NOT model.diagrams[0] — discovery order is
    // lexicographic file order (billing.yaml < context.yaml < ledger.yaml),
    // which would open this model on "3 · Component" while "1 · Context"
    // sits unselected.
    expect(model.diagrams[0]?.slug).toBe('billing'); // the trap the default must NOT follow
    expect(within(tabs).getByRole('button', { name: '1 · Context' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('diagrams ▸ context')).toBeInTheDocument();
    expect(await screen.findByText('Architect')).toBeInTheDocument();
  });

  it('honours initialDiagramSlug — the matching tab is pressed and the crumb names it', async () => {
    const model = await loadSyntheticModel();
    render(<C4Explorer model={model} initialDiagramSlug="ledger" />);

    expect(screen.getByRole('button', { name: '2 · Container' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('diagrams ▸ ledger')).toBeInTheDocument();
    expect(await screen.findByText('Billing')).toBeInTheDocument();
  });

  it('clicking a level tab switches the rendered diagram and the crumb', async () => {
    const model = await loadSyntheticModel();
    render(<C4Explorer model={model} initialDiagramSlug="context" />);
    await screen.findByText('Architect');

    fireEvent.click(screen.getByRole('button', { name: '2 · Container' }));

    expect(await screen.findByText('Billing')).toBeInTheDocument();
    expect(screen.queryByText('Architect')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2 · Container' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: '1 · Context' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByText('diagrams ▸ ledger')).toBeInTheDocument();
  });

  it('the hint text is always shown', async () => {
    const model = await loadSyntheticModel();
    render(<C4Explorer model={model} />);
    expect(screen.getByText('click an element for details')).toBeInTheDocument();
  });

  it('falls back to the diagram’s own title, appended after the numbered tabs, when a canonical type is ambiguous (two c4-container diagrams — neither can uniquely claim "2 · Container")', async () => {
    const model = await loadAmbiguousLevelModel();
    render(<C4Explorer model={model} />);

    const tabs = screen.getByRole('group', { name: 'C4 level' });
    const buttons = within(tabs).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual([
      '1 · Context',
      'Container View A',
      'Container View B',
    ]);
    // Neither ambiguous diagram gets a numbered label:
    expect(within(tabs).queryByRole('button', { name: /2 · Container/ })).not.toBeInTheDocument();
  });
});

describe('C4Explorer — clicking an element opens the detail overlay (A1: dismissible, not a permanent column)', () => {
  it('mounts no detail overlay until something is selected; selecting mounts it with aria-live', async () => {
    const model = await loadSyntheticModel();
    render(<C4Explorer model={model} initialDiagramSlug="context" />);
    await screen.findByText('Architect');

    // A1 (#131): the rail is an overlay that appears ON selection — an
    // unselected explorer renders NO complementary region (the pre-A1
    // permanent empty-state column is gone).
    expect(screen.queryByRole('complementary', { name: 'Element details' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /actor: Architect/i }));

    const rail = screen.getByRole('complementary', { name: 'Element details' });
    // The a11y acceptance item #120 names (#131 restates it as "aria-live
    // when shown"): selecting a canvas node must be ANNOUNCED (a rail
    // update, not a focus move) — dropping aria-live silences it for AT
    // users, so pin the attribute explicitly.
    expect(rail).toHaveAttribute('aria-live', 'polite');
    // Dismissible: the overlay carries its own close affordance.
    expect(within(rail).getByRole('button', { name: 'Close details' })).toBeInTheDocument();
  });

  it('the close button dismisses the overlay and clears the selection', async () => {
    const model = await loadSyntheticModel();
    render(<C4Explorer model={model} initialDiagramSlug="context" />);
    await screen.findByText('Architect');

    fireEvent.click(screen.getByRole('button', { name: /actor: Architect/i }));
    const rail = screen.getByRole('complementary', { name: 'Element details' });
    fireEvent.click(within(rail).getByRole('button', { name: 'Close details' }));

    expect(screen.queryByRole('complementary', { name: 'Element details' })).toBeNull();
    // The canvas card also drops its selected state (the halo follows the
    // caller-owned selection, which the close button just cleared).
    fireEvent.click(screen.getByRole('button', { name: /actor: Architect/i }));
    expect(screen.getByRole('complementary', { name: 'Element details' })).toBeInTheDocument();
  });

  it('clicking a node — WITHOUT drilling down — populates the rail with its kind/name/description', async () => {
    const model = await loadSyntheticModel();
    render(<C4Explorer model={model} initialDiagramSlug="context" />);
    await screen.findByText('Architect');

    fireEvent.click(screen.getByRole('button', { name: /actor: Architect/i }));

    // Still on the context diagram — a plain element click never navigates.
    expect(screen.getByRole('button', { name: '1 · Context' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const rail = screen.getByRole('complementary', { name: 'Element details' });
    expect(within(rail).getByText('actor')).toBeInTheDocument();
    expect(within(rail).getByText('Architect')).toBeInTheDocument();
    expect(
      within(rail).getByText('Designs systems and reviews proposed changes.'),
    ).toBeInTheDocument();
  });

  it('shows a Tech row for an element that carries a technology field (the rail omits it entirely otherwise — see the Architect case above, which has none)', async () => {
    const model = await loadSyntheticModel();
    render(<C4Explorer model={model} initialDiagramSlug="ledger" />);
    await screen.findByText('Billing');

    fireEvent.click(screen.getByRole('button', { name: /container: API Server/i }));

    const rail = screen.getByRole('complementary', { name: 'Element details' });
    expect(within(rail).getByText('API Server')).toBeInTheDocument();
    expect(within(rail).getByText('Tech')).toBeInTheDocument();
    expect(within(rail).getByText('Node.js')).toBeInTheDocument();
  });

  it('switching diagrams (via a level tab) clears the selection and dismisses the overlay', async () => {
    const model = await loadSyntheticModel();
    render(<C4Explorer model={model} initialDiagramSlug="context" />);
    await screen.findByText('Architect');
    fireEvent.click(screen.getByRole('button', { name: /actor: Architect/i }));
    expect(screen.getByRole('complementary', { name: 'Element details' }).textContent).toContain(
      'Architect',
    );

    fireEvent.click(screen.getByRole('button', { name: '2 · Container' }));
    await screen.findByText('Billing');

    expect(screen.queryByRole('complementary', { name: 'Element details' })).toBeNull();
  });

  it('clicking the canvas background clears the selection and dismisses the overlay', async () => {
    const model = await loadSyntheticModel();
    const { container } = render(<C4Explorer model={model} initialDiagramSlug="context" />);
    await screen.findByText('Architect');
    fireEvent.click(screen.getByRole('button', { name: /actor: Architect/i }));
    expect(screen.getByRole('complementary', { name: 'Element details' }).textContent).toContain(
      'Architect',
    );

    const root = container.querySelector('[data-canvas-root]') as HTMLElement;
    firePointer(root, 'pointerdown', { clientX: -900, clientY: -900 });
    firePointer(root, 'pointerup', { clientX: -900, clientY: -900 });

    expect(screen.queryByRole('complementary', { name: 'Element details' })).toBeNull();
  });

  it('pressing Escape clears the selection and dismisses the overlay', async () => {
    const model = await loadSyntheticModel();
    render(<C4Explorer model={model} initialDiagramSlug="context" />);
    await screen.findByText('Architect');
    fireEvent.click(screen.getByRole('button', { name: /actor: Architect/i }));
    expect(screen.getByRole('complementary', { name: 'Element details' }).textContent).toContain(
      'Architect',
    );

    fireEvent.keyDown(screen.getByRole('button', { name: /actor: Architect/i }), {
      key: 'Escape',
    });

    expect(screen.queryByRole('complementary', { name: 'Element details' })).toBeNull();
  });

  it('renders an element’s links through the LinksBlock, resolved via the host’s LinkResolver', async () => {
    const model = await loadSyntheticModel();
    const host: C4StudioHost = {
      capabilities: { editLayout: false },
      linkResolver: () => ({ resolved: true, href: 'https://example.com/readme' }),
    };
    render(<C4Explorer model={model} host={host} initialDiagramSlug="context" />);
    await screen.findByText('Architect');

    fireEvent.click(screen.getByRole('button', { name: /actor: Architect/i }));

    const rail = screen.getByRole('complementary', { name: 'Element details' });
    expect(within(rail).getByText('Traces to')).toBeInTheDocument();
    const link = within(rail).getByText('README.md').closest('a');
    expect(link).toHaveAttribute('href', 'https://example.com/readme');
  });

  it('renders a link as an inert label (no anchor/button) when the host cannot resolve it', async () => {
    const model = await loadSyntheticModel();
    render(<C4Explorer model={model} initialDiagramSlug="context" />);
    await screen.findByText('Architect');

    fireEvent.click(screen.getByRole('button', { name: /actor: Architect/i }));

    const rail = screen.getByRole('complementary', { name: 'Element details' });
    const inert = within(rail).getByText('README.md');
    expect(inert.closest('a, button')).toBeNull();
  });
});

describe('C4Explorer — drill-down via the rail’s own button (not an automatic click)', () => {
  it('an element whose slug names another diagram shows a drill button; clicking it switches diagrams, across all three levels', async () => {
    const model = await loadSyntheticModel();
    render(<C4Explorer model={model} initialDiagramSlug="context" />);
    await screen.findByText('Architect');

    // context -> container: select the injected system node (resolved slug "ledger").
    fireEvent.click(screen.getByRole('button', { name: /system: Ledger/i }));
    const rail = screen.getByRole('complementary', { name: 'Element details' });
    const drillToContainer = within(rail).getByRole('button', { name: /open container view/i });

    fireEvent.click(drillToContainer);
    expect(await screen.findByText('Billing')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2 · Container' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // The rail cleared on the diagram switch — the drill button isn't stuck open.
    expect(screen.queryByRole('complementary', { name: 'Element details' })).toBeNull();

    // container -> component: select the "billing" domain node (resolved slug "billing").
    fireEvent.click(screen.getByRole('button', { name: /domain: Billing/i }));
    const railAtContainer = screen.getByRole('complementary', { name: 'Element details' });
    fireEvent.click(within(railAtContainer).getByRole('button', { name: /open component view/i }));

    expect(await screen.findByText('Invoicing')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '3 · Component' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('an element whose slug matches no diagram shows no drill button — selecting it just populates the rail', async () => {
    const model = await loadSyntheticModel();
    render(<C4Explorer model={model} initialDiagramSlug="context" />);
    await screen.findByText('Architect');

    fireEvent.click(screen.getByRole('button', { name: /actor: Architect/i }));

    // Still on the context diagram — no drill target for the actor.
    expect(screen.getByRole('button', { name: '1 · Context' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const rail = screen.getByRole('complementary', { name: 'Element details' });
    expect(within(rail).queryByRole('button', { name: /open .* view/i })).not.toBeInTheDocument();
  });
});

describe('C4Explorer — lens toggle for a c4-container diagram', () => {
  it('shows no lens toggle for a non-lens-partitioned diagram (context)', async () => {
    const model = await loadSyntheticModel();
    render(<C4Explorer model={model} initialDiagramSlug="context" />);
    await screen.findByText('Architect');
    expect(screen.queryByText('Logical')).not.toBeInTheDocument();
    expect(screen.queryByText('Deployment')).not.toBeInTheDocument();
  });

  it('defaults a c4-container diagram to the logical lens: its edges render, the deployment-only edge does not', async () => {
    const model = await loadSyntheticModel();
    render(<C4Explorer model={model} initialDiagramSlug="ledger" />);
    await screen.findByText('Billing');

    expect(screen.getByText('Logical')).toBeInTheDocument();
    expect(screen.getByText('publishes events')).toBeInTheDocument(); // lens: logical
    expect(screen.getByText('publishes/consumes')).toBeInTheDocument(); // lens: both
    expect(screen.queryByText('reads/writes')).not.toBeInTheDocument(); // lens: deployment
  });

  it('switching to the deployment lens re-lays-out with the deployment-lens edges', async () => {
    const model = await loadSyntheticModel();
    render(<C4Explorer model={model} initialDiagramSlug="ledger" />);
    await screen.findByText('Billing');

    fireEvent.click(screen.getByText('Deployment'));

    expect(await screen.findByText('reads/writes')).toBeInTheDocument(); // lens: deployment
    expect(screen.getByText('publishes/consumes')).toBeInTheDocument(); // lens: both
    expect(screen.queryByText('publishes events')).not.toBeInTheDocument(); // lens: logical
  });
});

describe('C4Explorer — controlled diagram selection (A1: the studio sidebar drives the explorer)', () => {
  it('renders the diagram named by selectedDiagramSlug, ignoring initialDiagramSlug', async () => {
    const model = await loadSyntheticModel();
    render(<C4Explorer model={model} initialDiagramSlug="context" selectedDiagramSlug="ledger" />);

    expect(await screen.findByText('Billing')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2 · Container' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('diagrams ▸ ledger')).toBeInTheDocument();
  });

  it('a level-tab click in controlled mode raises onDiagramChange and does NOT switch by itself', async () => {
    const model = await loadSyntheticModel();
    const onDiagramChange = vi.fn();
    render(
      <C4Explorer model={model} selectedDiagramSlug="context" onDiagramChange={onDiagramChange} />,
    );
    await screen.findByText('Architect');

    fireEvent.click(screen.getByRole('button', { name: '2 · Container' }));

    expect(onDiagramChange).toHaveBeenCalledExactlyOnceWith('ledger');
    // Controlled: until the host reflects the slug back, the diagram stays.
    expect(screen.getByText('Architect')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1 · Context' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('the host reflecting a new selectedDiagramSlug switches the diagram and dismisses an open detail overlay', async () => {
    const model = await loadSyntheticModel();
    const { rerender } = render(<C4Explorer model={model} selectedDiagramSlug="context" />);
    await screen.findByText('Architect');
    fireEvent.click(screen.getByRole('button', { name: /actor: Architect/i }));
    expect(screen.getByRole('complementary', { name: 'Element details' })).toBeInTheDocument();

    rerender(<C4Explorer model={model} selectedDiagramSlug="ledger" />);

    expect(await screen.findByText('Billing')).toBeInTheDocument();
    expect(screen.queryByText('Architect')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2 · Container' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // The stale selection from the previous diagram is gone with the switch.
    expect(screen.queryByRole('complementary', { name: 'Element details' })).toBeNull();
  });

  it('onDiagramChange also reports uncontrolled navigation (tab click still switches internally)', async () => {
    const model = await loadSyntheticModel();
    const onDiagramChange = vi.fn();
    render(
      <C4Explorer model={model} initialDiagramSlug="context" onDiagramChange={onDiagramChange} />,
    );
    await screen.findByText('Architect');

    fireEvent.click(screen.getByRole('button', { name: '2 · Container' }));

    expect(onDiagramChange).toHaveBeenCalledExactlyOnceWith('ledger');
    expect(await screen.findByText('Billing')).toBeInTheDocument();
  });

  it('a controlled slug matching no diagram selects nothing (the host owns the value)', async () => {
    const model = await loadSyntheticModel();
    render(<C4Explorer model={model} selectedDiagramSlug="no-such-diagram" />);

    expect(screen.getByText('diagrams ▸ —')).toBeInTheDocument();
    expect(screen.queryByText('Architect')).not.toBeInTheDocument();
    const tabs = screen.getByRole('group', { name: 'C4 level' });
    for (const button of within(tabs).getAllByRole('button')) {
      expect(button).toHaveAttribute('aria-pressed', 'false');
    }
  });
});

describe('C4Explorer — canvas chrome passthrough (A1: grid / zoom / minimap reach C4Diagram)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders no grid, zoom controls, or minimap by default — pre-A1 consumers unchanged', async () => {
    const model = await loadSyntheticModel();
    const { container } = render(<C4Explorer model={model} initialDiagramSlug="context" />);
    await screen.findByText('Architect');

    expect(container.querySelector('.c4-diagram svg pattern')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Zoom in' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Fit view' })).toBeNull();
    expect(container.querySelector('svg[width="192"]')).toBeNull();
  });

  it('backgroundVariant="dots" mounts the dotted grid beneath the canvas', async () => {
    const model = await loadSyntheticModel();
    const { container } = render(
      <C4Explorer model={model} initialDiagramSlug="context" backgroundVariant="dots" />,
    );
    await screen.findByText('Architect');

    // The Background layer's dot pattern (minor + major SVG patterns).
    expect(container.querySelectorAll('.c4-diagram svg pattern circle').length).toBeGreaterThan(0);
  });

  it('showZoomControls mounts the shared zoom cluster (in / % / out / fit)', async () => {
    const model = await loadSyntheticModel();
    render(<C4Explorer model={model} initialDiagramSlug="context" showZoomControls />);
    await screen.findByText('Architect');

    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fit view' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset zoom to 100%' })).toBeInTheDocument();
  });

  it('showMinimap mounts the shared minimap once the canvas has a measured viewport', async () => {
    // The minimap self-gates on a non-zero measured viewport (and ≥ 2
    // shapes) — jsdom rects are all zero, so give every element a real box.
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
    const model = await loadSyntheticModel();
    const { container } = render(
      <C4Explorer model={model} initialDiagramSlug="context" showMinimap />,
    );
    await screen.findByText('Architect');

    // The minimap's fixed 192×128 panel SVG.
    expect(container.querySelector('svg[width="192"]')).not.toBeNull();
  });
});

describe('C4Explorer — a DECLINED controlled navigation changes nothing (A1 review fix)', () => {
  // The pre-fix `selectDiagram` reset lens + rail selection synchronously,
  // before the host had reflected anything back — so in controlled mode a
  // navigation the host chose to DECLINE still wiped both. The reset now
  // hangs off the selected slug ACTUALLY changing.
  it('keeps the current lens and the open detail rail when the host never reflects the slug back', async () => {
    const model = await loadSyntheticModel();
    const onDiagramChange = vi.fn();
    render(
      <C4Explorer model={model} selectedDiagramSlug="ledger" onDiagramChange={onDiagramChange} />,
    );
    await screen.findByText('Billing');

    // Move OFF the default lens…
    fireEvent.click(screen.getByText('Deployment'));
    expect(await screen.findByText('reads/writes')).toBeInTheDocument();
    // …and open the detail rail.
    fireEvent.click(screen.getByRole('button', { name: /domain: Billing/i }));
    expect(screen.getByRole('complementary', { name: 'Element details' })).toBeInTheDocument();

    // Navigate. The host DECLINES: `selectedDiagramSlug` never changes.
    fireEvent.click(screen.getByRole('button', { name: '1 · Context' }));
    expect(onDiagramChange).toHaveBeenCalledExactlyOnceWith('context');

    // Nothing moved: same diagram, same deployment lens, same open rail.
    expect(screen.getByText('reads/writes')).toBeInTheDocument();
    expect(screen.queryByText('publishes events')).not.toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Element details' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2 · Container' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('the rail-drill button the host declines is likewise inert — the rail stays exactly as it was', async () => {
    const model = await loadSyntheticModel();
    const onDiagramChange = vi.fn();
    render(
      <C4Explorer model={model} selectedDiagramSlug="context" onDiagramChange={onDiagramChange} />,
    );
    await screen.findByText('Architect');
    fireEvent.click(screen.getByRole('button', { name: /system: Ledger/i }));
    const rail = screen.getByRole('complementary', { name: 'Element details' });

    fireEvent.click(within(rail).getByRole('button', { name: /open container view/i }));

    expect(onDiagramChange).toHaveBeenCalledExactlyOnceWith('ledger');
    const stillOpen = screen.getByRole('complementary', { name: 'Element details' });
    expect(
      within(stillOpen).getByRole('button', { name: /open container view/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('Architect')).toBeInTheDocument();
  });
});

describe('C4Explorer — its OWN Escape handler (A1 review: not C4Diagram’s)', () => {
  // The sibling Escape case fires on a canvas NODE, so C4Diagram's own
  // container handler clears the selection and the rail follows — no-oping
  // C4Explorer's handler leaves that test green. These fire from OUTSIDE
  // the canvas subtree, where only C4Explorer's handler can run.
  it('Escape pressed inside the detail rail dismisses it', async () => {
    const model = await loadSyntheticModel();
    render(<C4Explorer model={model} initialDiagramSlug="context" />);
    await screen.findByText('Architect');
    fireEvent.click(screen.getByRole('button', { name: /actor: Architect/i }));
    const rail = screen.getByRole('complementary', { name: 'Element details' });
    // Guard: the rail really is outside the canvas subtree, so this event
    // cannot reach C4Diagram's container handler on its way up.
    expect(rail.closest('.c4-diagram')).toBeNull();

    fireEvent.keyDown(within(rail).getByRole('button', { name: 'Close details' }), {
      key: 'Escape',
    });

    expect(screen.queryByRole('complementary', { name: 'Element details' })).toBeNull();
  });

  it('a non-Escape key inside the rail leaves it open', async () => {
    const model = await loadSyntheticModel();
    render(<C4Explorer model={model} initialDiagramSlug="context" />);
    await screen.findByText('Architect');
    fireEvent.click(screen.getByRole('button', { name: /actor: Architect/i }));
    const rail = screen.getByRole('complementary', { name: 'Element details' });

    fireEvent.keyDown(within(rail).getByRole('button', { name: 'Close details' }), { key: 'a' });

    expect(screen.getByRole('complementary', { name: 'Element details' })).toBeInTheDocument();
  });
});

describe('C4Explorer — showHeader (A1 owner ruling: the host supplies on-canvas navigation)', () => {
  it('renders the level tabs, crumb and hint by default — every pre-A1 consumer unchanged', async () => {
    const model = await loadSyntheticModel();
    render(<C4Explorer model={model} initialDiagramSlug="context" />);
    await screen.findByText('Architect');

    expect(screen.getByRole('group', { name: 'C4 level' })).toBeInTheDocument();
    expect(screen.getByText('diagrams ▸ context')).toBeInTheDocument();
    expect(screen.getByText('click an element for details')).toBeInTheDocument();
  });

  it('showHeader={false} drops the whole header row, keeping the canvas and its overlays', async () => {
    const model = await loadSyntheticModel();
    render(<C4Explorer model={model} initialDiagramSlug="ledger" showHeader={false} />);
    await screen.findByText('Billing');

    expect(screen.queryByRole('group', { name: 'C4 level' })).toBeNull();
    expect(screen.queryByText(/diagrams ▸/)).toBeNull();
    expect(screen.queryByText('click an element for details')).toBeNull();
    // The on-canvas lens overlay is chrome, not header — it survives.
    expect(screen.getByText('Logical')).toBeInTheDocument();
  });

  it('headerless selection is still fully driveable by the host (controlled) and still reports back', async () => {
    const model = await loadSyntheticModel();
    const onDiagramChange = vi.fn();
    const { rerender } = render(
      <C4Explorer
        model={model}
        showHeader={false}
        selectedDiagramSlug="context"
        onDiagramChange={onDiagramChange}
      />,
    );
    await screen.findByText('Architect');

    // No tabs to click — the host navigates by changing the prop.
    rerender(
      <C4Explorer
        model={model}
        showHeader={false}
        selectedDiagramSlug="ledger"
        onDiagramChange={onDiagramChange}
      />,
    );
    expect(await screen.findByText('Billing')).toBeInTheDocument();

    // …and the rail's drill button still reports internal navigation up.
    fireEvent.click(screen.getByRole('button', { name: /domain: Billing/i }));
    const rail = screen.getByRole('complementary', { name: 'Element details' });
    fireEvent.click(within(rail).getByRole('button', { name: /open component view/i }));
    expect(onDiagramChange).toHaveBeenCalledExactlyOnceWith('billing');
  });
});

describe('C4Explorer — onCanvasReady passthrough (A1 review: the A2/A3 host-installation seam)', () => {
  it('threads the live instance up from C4Diagram, and re-fires with a FRESH one on a diagram switch', async () => {
    const model = await loadSyntheticModel();
    const onCanvasReady = vi.fn();
    render(
      <C4Explorer model={model} initialDiagramSlug="context" onCanvasReady={onCanvasReady} />,
    );
    await screen.findByText('Architect');

    expect(onCanvasReady).toHaveBeenCalledTimes(1);
    const first = onCanvasReady.mock.calls[0]?.[0] as CanvasStoreInstance;
    expect(Object.keys(first.getState().shapes).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: '2 · Container' }));
    await screen.findByText('Billing');

    // The explorer REMOUNTS its diagram per switch, so the host must
    // reinstall on the new instance — never cache the old one.
    expect(onCanvasReady).toHaveBeenCalledTimes(2);
    const second = onCanvasReady.mock.calls[1]?.[0] as CanvasStoreInstance;
    expect(second).not.toBe(first);
  });

  it('is not called at all while no diagram is laid out (a slug matching nothing)', async () => {
    const model = await loadSyntheticModel();
    const onCanvasReady = vi.fn();
    render(
      <C4Explorer model={model} selectedDiagramSlug="no-such-diagram" onCanvasReady={onCanvasReady} />,
    );

    expect(screen.getByText('diagrams ▸ —')).toBeInTheDocument();
    expect(onCanvasReady).not.toHaveBeenCalled();
  });
});

describe('C4Explorer — a model REFRESH is not a view switch (A2 review: the editor camera defect)', () => {
  // jsdom gives every element a ZERO rect, which makes `fitCamera` return the
  // identity camera — so a "camera survived" assertion against zero rects
  // passes whether or not anything survived. Give the canvas a real 800×600
  // box (same trick as the minimap case above) so the initial fit is a real,
  // distinguishable camera.
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

  /** Where the user parked the viewport — deliberately nothing `fitCamera` would ever return here. */
  const PARKED = { x: 137, y: -42, zoom: 0.61 };

  it('a NEW-but-equal C4Model keeps the same CanvasStoreInstance, its installed host, and the exact camera the user set', async () => {
    const model = await loadSyntheticModel();
    const onCanvasReady = vi.fn();
    const { rerender } = render(
      <C4Explorer model={model} initialDiagramSlug="context" onCanvasReady={onCanvasReady} />,
    );
    await screen.findByText('Architect');

    expect(onCanvasReady).toHaveBeenCalledTimes(1);
    const instance = onCanvasReady.mock.calls[0]?.[0] as CanvasStoreInstance;
    // Stand in for c4-studio's `installStudioCanvasHost` — the whole point of
    // not remounting is that a host installed on the FIRST mount stays live.
    const deleteShapes = vi.fn(() => false);
    instance.host = { deleteShapes };

    const fitted = instance.getState().camera;
    expect(fitted).not.toEqual(PARKED); // the camera assertion below discriminates
    instance.getState().setCamera(PARKED);

    // Count re-projections: `_setShapesRaw` mints a fresh shape record, so a
    // change of `shapes` identity IS one projection pass. The refresh runs
    // two (the new `resolved` identity, then the landed layout) — waiting for
    // both is what stops this test passing vacuously by asserting before the
    // refresh has done anything at all.
    let projections = 0;
    const unsubscribe = instance.subscribe((state, prev) => {
      if (state.shapes !== prev.shapes) projections += 1;
    });

    // Exactly the studio shell's post-mutation `loadModel()`: a brand-new
    // `C4Model` object with byte-identical content. No diagram switch, no
    // lens switch, no direction change.
    const refreshed = await loadSyntheticModel();
    expect(refreshed).not.toBe(model);
    rerender(
      <C4Explorer model={refreshed} initialDiagramSlug="context" onCanvasReady={onCanvasReady} />,
    );
    await waitFor(() => {
      // Settled EITHER way: the fix re-projects this same instance twice,
      // while the pre-fix remount tears it down and fires `onCanvasReady`
      // again (a disposed store never reaches two projections). Accepting
      // whichever arrives keeps the wait a wait — so the assertions below,
      // not the timeout, are what report the defect.
      expect(projections >= 2 || onCanvasReady.mock.calls.length > 1).toBe(true);
    });
    unsubscribe();

    // No remount: one instance, still carrying the host installed on it.
    expect(onCanvasReady).toHaveBeenCalledTimes(1);
    expect(instance.host.deleteShapes).toBe(deleteShapes);
    // And no re-fit: x, y AND zoom are exactly where the user left them.
    expect(instance.getState().camera).toEqual(PARKED);
    // The refreshed model really is on screen.
    expect(screen.getByText('Architect')).toBeInTheDocument();
  });

  it('switching diagram IS a view switch: a fresh instance, re-fit — the parked camera does not carry over', async () => {
    const model = await loadSyntheticModel();
    const onCanvasReady = vi.fn();
    render(<C4Explorer model={model} initialDiagramSlug="context" onCanvasReady={onCanvasReady} />);
    await screen.findByText('Architect');

    const first = onCanvasReady.mock.calls[0]?.[0] as CanvasStoreInstance;
    first.getState().setCamera(PARKED);

    fireEvent.click(screen.getByRole('button', { name: '2 · Container' }));
    await screen.findByText('Billing');

    expect(onCanvasReady).toHaveBeenCalledTimes(2);
    const second = onCanvasReady.mock.calls[1]?.[0] as CanvasStoreInstance;
    expect(second).not.toBe(first);
    const camera = second.getState().camera;
    expect(camera).not.toEqual(PARKED);
    // A REAL fit against the mocked 800×600 box, not the zero-rect fallback.
    expect(camera).not.toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it('switching lens IS a view switch too: a fresh instance, re-fit on the new lens’ layout', async () => {
    const model = await loadSyntheticModel();
    const onCanvasReady = vi.fn();
    render(<C4Explorer model={model} initialDiagramSlug="ledger" onCanvasReady={onCanvasReady} />);
    await screen.findByText('Billing');

    const first = onCanvasReady.mock.calls[0]?.[0] as CanvasStoreInstance;
    first.getState().setCamera(PARKED);

    fireEvent.click(screen.getByText('Deployment'));
    await screen.findByText('reads/writes');

    expect(onCanvasReady).toHaveBeenCalledTimes(2);
    const second = onCanvasReady.mock.calls[1]?.[0] as CanvasStoreInstance;
    expect(second).not.toBe(first);
    expect(second.getState().camera).not.toEqual(PARKED);
  });
});
