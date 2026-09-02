import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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

describe('C4Explorer — clicking an element populates the detail rail', () => {
  it('keeps collapsible details closed until selection and lets the user close them again', async () => {
    const model = await loadSyntheticModel();
    render(<C4Explorer model={model} initialDiagramSlug="context" collapsibleDetails />);
    await screen.findByText('Architect');

    expect(
      screen.queryByRole('complementary', { name: 'Element details' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /actor: Architect/i }));
    expect(screen.getByRole('complementary', { name: 'Element details' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse element details' }));
    expect(
      screen.queryByRole('complementary', { name: 'Element details' }),
    ).not.toBeInTheDocument();
  });

  it('shows the empty state until something is selected', async () => {
    const model = await loadSyntheticModel();
    render(<C4Explorer model={model} initialDiagramSlug="context" />);
    await screen.findByText('Architect');

    const rail = screen.getByRole('complementary', { name: 'Element details' });
    expect(within(rail).getByText('Element details')).toBeInTheDocument();
    expect(
      within(rail).getByText(/select an element on the canvas to inspect it/i),
    ).toBeInTheDocument();
    // The a11y acceptance item #120 names: selecting a canvas node must be
    // ANNOUNCED (a rail update, not a focus move) — dropping aria-live
    // silences it for AT users, so pin the attribute explicitly.
    expect(rail).toHaveAttribute('aria-live', 'polite');
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

  it('switching diagrams (via a level tab) clears the rail selection', async () => {
    const model = await loadSyntheticModel();
    render(<C4Explorer model={model} initialDiagramSlug="context" />);
    await screen.findByText('Architect');
    fireEvent.click(screen.getByRole('button', { name: /actor: Architect/i }));
    expect(screen.getByRole('complementary', { name: 'Element details' }).textContent).toContain(
      'Architect',
    );

    fireEvent.click(screen.getByRole('button', { name: '2 · Container' }));
    await screen.findByText('Billing');

    const rail = screen.getByRole('complementary', { name: 'Element details' });
    expect(within(rail).getByText('Element details')).toBeInTheDocument();
    expect(within(rail).queryByText('Architect')).not.toBeInTheDocument();
  });

  it('clicking the canvas background clears the rail selection', async () => {
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

    const rail = screen.getByRole('complementary', { name: 'Element details' });
    expect(within(rail).getByText('Element details')).toBeInTheDocument();
  });

  it('pressing Escape clears the rail selection', async () => {
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

    const rail = screen.getByRole('complementary', { name: 'Element details' });
    expect(within(rail).getByText('Element details')).toBeInTheDocument();
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
    expect(
      within(screen.getByRole('complementary', { name: 'Element details' })).getByText(
        'Element details',
      ),
    ).toBeInTheDocument();

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
