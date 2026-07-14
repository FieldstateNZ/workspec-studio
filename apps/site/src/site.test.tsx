import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from '@testing-library/user-event';

import { C4 } from './c4.js';
import { C4Demo } from './c4-demo.js';
import { Cost } from './cost.js';
import { CostDemo } from './cost-demo.js';
import { Decisions } from './decisions.js';
import { Demo } from './demo.js';
import { renderAdr } from './export-adr.js';
import { DEMO_EXAMPLES, createDemoRepository } from './seed.js';
import { StudioHome } from './studio-home.js';

// The shell nav's active pill now tracks the route SiteNav reads via
// useRoute() (Studio redesign, round 3), not a per-page `current` prop —
// each describe block below pushes its own page's path before rendering, so
// reset it after every test rather than let it leak into the next one.
afterEach(() => {
  window.history.pushState({}, '', '/');
});

// On a demo route, "Decisions" and "C4 Model" each appear TWICE: once as the
// shell nav's pill (to the module's pitch page) and once as the workbench
// bar's module tab (to the OTHER module's demo route) — same accessible
// name, different `href`. Disambiguate by href rather than relying on
// document order.
function findLink(name: string, href: string): HTMLElement {
  const match = screen
    .getAllByRole('link', { name })
    .find((link) => link.getAttribute('href') === href);
  if (match === undefined) throw new Error(`no link named "${name}" with href "${href}"`);
  return match;
}

describe('Studio landing page (/)', () => {
  it('renders the hero pitch and both hero CTAs into the module pitch pages', () => {
    render(<StudioHome />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      /one typed graph\. two lenses/i,
    );
    expect(screen.getByRole('link', { name: /open the studio/i })).toHaveAttribute(
      'href',
      '/decisions',
    );
    expect(screen.getByRole('link', { name: /explore the c4 model/i })).toHaveAttribute(
      'href',
      '/c4',
    );
  });

  it('renders both module cards, each linking to its own pitch page', () => {
    render(<StudioHome />);
    expect(screen.getByRole('link', { name: /open the workbench/i })).toHaveAttribute(
      'href',
      '/decisions',
    );
    expect(screen.getByRole('link', { name: /open the explorer/i })).toHaveAttribute('href', '/c4');
    // Both modules carry the mockup's "live" pill — the @workspec/c4-* family
    // (c4-studio included) is on npm at 0.1.0-alpha, verified against the
    // registry during round-3 review.
    expect(screen.getAllByText('live')).toHaveLength(2);
    expect(screen.queryByText('in progress')).not.toBeInTheDocument();
  });

  it('states the real license and links out to the schema registry', () => {
    render(<StudioHome />);
    expect(screen.getByText(/apache-2\.0/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /schema registry/i })).toHaveAttribute(
      'href',
      'https://schema.workspec.io/',
    );
  });

  it('marks the Home nav pill active, leaving Decisions / C4 Model inactive', () => {
    window.history.pushState({}, '', '/');
    render(<StudioHome />);
    expect(screen.getByRole('link', { name: 'Home' })).toHaveClass('nav-pill-active');
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Decisions' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Decisions' })).not.toHaveClass('nav-pill-active');
    expect(screen.getByRole('link', { name: 'C4 Model' })).not.toHaveClass('nav-pill-active');
  });
});

describe('decisions module page (/decisions)', () => {
  it('renders the positioning and routes to its demo', () => {
    render(<Decisions />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      /costed architecture decisions/i,
    );
    const demoLinks = screen.getAllByRole('link', { name: /demo/i });
    expect(demoLinks.length).toBeGreaterThan(0);
    for (const link of demoLinks) {
      expect(link).toHaveAttribute('href', '/decisions/demo');
    }
  });

  it('marks the Decisions nav pill active, leaving Home / C4 Model inactive', () => {
    window.history.pushState({}, '', '/decisions');
    render(<Decisions />);
    expect(screen.getByRole('link', { name: 'Decisions' })).toHaveClass('nav-pill-active');
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveClass('nav-pill-active');
    expect(screen.getByRole('link', { name: 'C4 Model' })).not.toHaveClass('nav-pill-active');
  });
});

describe('c4 module page (/c4) — pitch, no embedded demo', () => {
  it('states what the module is, links each package to its GitHub source, and routes to /c4/demo', () => {
    render(<C4 />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      /browse, validate, and render c4 architecture trees/i,
    );
    // Source links, NOT npm — the c4 packages aren't published yet, so an npm
    // href would 404 for anyone clicking through from the live page.
    const packagesBase = 'https://github.com/FieldstateNZ/workspec-studio/tree/main/packages';
    for (const pkg of ['c4-schema', 'c4-model', 'c4-layout', 'c4-ui', 'c4-studio']) {
      expect(screen.getByRole('link', { name: `@workspec/${pkg}` })).toHaveAttribute(
        'href',
        `${packagesBase}/${pkg}`,
      );
    }
    // The old "coming soon, nothing to click through" stub copy is gone.
    expect(screen.queryByText(/not live yet/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/nothing to click through here yet/i)).not.toBeInTheDocument();
    // The live explorer moved to its own full-page route (finding 06) —
    // every "demo" link here points at it, none embed it inline.
    const demoLinks = screen.getAllByRole('link', { name: /demo/i });
    expect(demoLinks.length).toBeGreaterThan(0);
    for (const link of demoLinks) {
      expect(link).toHaveAttribute('href', '/c4/demo');
    }
  });

  it('nav lists Home, Decisions, and C4 Model, matching Decisions’ nav (finding 07)', () => {
    render(<C4 />);
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Decisions' })).toHaveAttribute('href', '/decisions');
    expect(screen.getByRole('link', { name: 'C4 Model' })).toHaveAttribute('href', '/c4');
  });

  it('marks the C4 Model nav pill active, leaving Home / Decisions inactive', () => {
    window.history.pushState({}, '', '/c4');
    render(<C4 />);
    expect(screen.getByRole('link', { name: 'C4 Model' })).toHaveClass('nav-pill-active');
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveClass('nav-pill-active');
    expect(screen.getByRole('link', { name: 'Decisions' })).not.toHaveClass('nav-pill-active');
  });
});

describe('c4 demo page (/c4/demo) — full-page demo shell, same pattern as Decisions’', () => {
  it('mounts a real C4Explorer over the representative example tree', async () => {
    render(<C4Demo />);
    expect(screen.getByText(/loading the demo tree/i)).toBeInTheDocument();

    // The explorer's level tabs list both diagrams from the seeded tree
    // (c4-ui's workbench layout: canonical levels numbered, not a tree nav).
    expect(await screen.findByRole('button', { name: '1 · Context' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2 · Container' })).toBeInTheDocument();

    // The default (first) diagram's canvas rendered its elements.
    expect(await screen.findByText('Architect')).toBeInTheDocument();
    expect(screen.getByText('Payment Gateway')).toBeInTheDocument();
  });

  it('drill-down works: switching the level tabs swaps the rendered diagram', async () => {
    const user = userEvent.setup();
    render(<C4Demo />);

    await screen.findByText('Architect'); // system-context is showing first

    await user.click(screen.getByRole('button', { name: '2 · Container' }));

    // The container diagram's own elements now render…
    expect(await screen.findByText('Billing')).toBeInTheDocument();
    expect(screen.getByText('Primary Database')).toBeInTheDocument();
    // …and the system-context-only element is gone.
    expect(screen.queryByText('Payment Gateway')).not.toBeInTheDocument();
  });

  it('renders the shell nav above the workbench bar, both agreeing C4 Model is active (Studio redesign, round 3)', () => {
    window.history.pushState({}, '', '/c4/demo');
    render(<C4Demo />);

    // Shell nav: the C4 Model pitch-page pill lights; Home / Decisions don't.
    const shellC4Pill = findLink('C4 Model', '/c4');
    expect(shellC4Pill).toHaveClass('nav-pill-active');
    expect(shellC4Pill).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveClass('nav-pill-active');
    expect(findLink('Decisions', '/decisions')).not.toHaveClass('nav-pill-active');

    // Workbench bar: its OWN module tab (a different link, to the demo
    // route) also lights; the Decisions tab crosses over to the other demo.
    const wbNav = screen.getByRole('navigation', { name: 'Studio' });
    const wbC4Tab = within(wbNav).getByRole('link', { name: 'C4 Model' });
    expect(wbC4Tab).toHaveClass('wb-tab-active');
    expect(wbC4Tab).toHaveAttribute('aria-current', 'page');
    const wbDecisionsTab = within(wbNav).getByRole('link', { name: 'Decisions' });
    expect(wbDecisionsTab).toHaveAttribute('href', '/decisions/demo');
    expect(wbDecisionsTab).not.toHaveClass('wb-tab-active');
  });

  it('shows the demo tree’s name in the workbench bar’s crumb and leaves the actions slot empty', () => {
    render(<C4Demo />);
    expect(screen.getByText('Fieldstate Ledger')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /export adr/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^reset$/i })).not.toBeInTheDocument();
  });
});

describe('cost module page (/cost) — pitch, no embedded demo', () => {
  it('states what the module is, links each package to its GitHub source, and routes to /cost/demo', () => {
    render(<Cost />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      /stock-take a cloud estate/i,
    );
    // Source links, NOT npm — the cost packages aren't published yet, so an
    // npm href would 404 for anyone clicking through from the live page.
    const packagesBase = 'https://github.com/FieldstateNZ/workspec-studio/tree/main/packages';
    for (const pkg of [
      'cost-schema',
      'cost-provider',
      'cost-provider-azure',
      'cost-engine',
      'cost-ui',
      'cost-studio',
    ]) {
      expect(screen.getByRole('link', { name: `@workspec/${pkg}` })).toHaveAttribute(
        'href',
        `${packagesBase}/${pkg}`,
      );
    }
    const demoLinks = screen.getAllByRole('link', { name: /demo/i });
    expect(demoLinks.length).toBeGreaterThan(0);
    for (const link of demoLinks) {
      expect(link).toHaveAttribute('href', '/cost/demo');
    }
  });

  it('nav lists Home, Decisions, C4 Model, and Cost, matching the other pitch pages', () => {
    render(<Cost />);
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Decisions' })).toHaveAttribute('href', '/decisions');
    expect(screen.getByRole('link', { name: 'C4 Model' })).toHaveAttribute('href', '/c4');
    expect(screen.getByRole('link', { name: 'Cost' })).toHaveAttribute('href', '/cost');
  });

  it('marks the Cost nav pill active, leaving Home / Decisions / C4 Model inactive', () => {
    window.history.pushState({}, '', '/cost');
    render(<Cost />);
    expect(screen.getByRole('link', { name: 'Cost' })).toHaveClass('nav-pill-active');
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveClass('nav-pill-active');
    expect(screen.getByRole('link', { name: 'Decisions' })).not.toHaveClass('nav-pill-active');
    expect(screen.getByRole('link', { name: 'C4 Model' })).not.toHaveClass('nav-pill-active');
  });
});

describe('cost demo page (/cost/demo) — full-page demo shell, same pattern as Decisions’', () => {
  it('mounts a real CostApp over the worked fieldstate-azure estate, at 100% coverage', async () => {
    render(<CostDemo />);
    // Attribution is the default view — the coverage row renders once the
    // seeded repository resolves.
    expect(await screen.findByText('100.0%')).toBeInTheDocument();
    expect(screen.getByText('$0/mo unattributed')).toBeInTheDocument();
  });

  it('renders the shell nav above the workbench bar, both agreeing Cost is active (Studio redesign, round 3)', () => {
    window.history.pushState({}, '', '/cost/demo');
    render(<CostDemo />);

    const shellCostPill = findLink('Cost', '/cost');
    expect(shellCostPill).toHaveClass('nav-pill-active');
    expect(shellCostPill).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveClass('nav-pill-active');
    expect(findLink('Decisions', '/decisions')).not.toHaveClass('nav-pill-active');
    expect(findLink('C4 Model', '/c4')).not.toHaveClass('nav-pill-active');

    const wbNav = screen.getByRole('navigation', { name: 'Studio' });
    const wbCostTab = within(wbNav).getByRole('link', { name: 'Cost' });
    expect(wbCostTab).toHaveClass('wb-tab-active');
    expect(wbCostTab).toHaveAttribute('aria-current', 'page');
    const wbDecisionsTab = within(wbNav).getByRole('link', { name: 'Decisions' });
    expect(wbDecisionsTab).toHaveAttribute('href', '/decisions/demo');
    expect(wbDecisionsTab).not.toHaveClass('wb-tab-active');
  });

  it('shows the worked estate’s name in the crumb and keeps Export CSV / Reset in the actions slot', async () => {
    render(<CostDemo />);
    expect(screen.getByText('fieldstate-azure')).toBeInTheDocument();
    await screen.findByText('100.0%'); // wait for the seeded repository to resolve
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument();
  });
});

describe('demo — the real DecisionApp against the PUBLISHED @workspec/* packages', () => {
  it('mounts, shows the in-browser banner, and loads a seeded decision', async () => {
    render(<Demo />);
    // Chrome we own renders synchronously.
    expect(screen.getByText(/changes live only in your browser/i)).toBeInTheDocument();
    // Proof the published DecisionApp mounted: its four-view nav appears…
    expect(await screen.findByText('Compare')).toBeInTheDocument();
    // …and the seeded decision's title loads through the async repository port.
    expect(
      await screen.findByRole('heading', { name: /hosting platform for the data/i }),
    ).toBeInTheDocument();
  });

  it('renders the shell nav above the workbench bar, both agreeing Decisions is active (Studio redesign, round 3)', () => {
    window.history.pushState({}, '', '/decisions/demo');
    render(<Demo />);

    // Shell nav: the Decisions pitch-page pill lights; Home / C4 Model don't.
    const shellDecisionsPill = findLink('Decisions', '/decisions');
    expect(shellDecisionsPill).toHaveClass('nav-pill-active');
    expect(shellDecisionsPill).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveClass('nav-pill-active');
    expect(findLink('C4 Model', '/c4')).not.toHaveClass('nav-pill-active');

    // Workbench bar: its OWN module tab (a different link, to the demo
    // route) also lights; the C4 Model tab crosses over to the other demo.
    const wbNav = screen.getByRole('navigation', { name: 'Studio' });
    const wbDecisionsTab = within(wbNav).getByRole('link', { name: 'Decisions' });
    expect(wbDecisionsTab).toHaveClass('wb-tab-active');
    expect(wbDecisionsTab).toHaveAttribute('aria-current', 'page');
    const wbC4Tab = within(wbNav).getByRole('link', { name: 'C4 Model' });
    expect(wbC4Tab).toHaveAttribute('href', '/c4/demo');
    expect(wbC4Tab).not.toHaveClass('wb-tab-active');
  });

  it('keeps the worked-example switcher and module actions in the workbench bar', async () => {
    render(<Demo />);
    await screen.findByText('Compare'); // wait for the published DecisionApp to mount

    const switcher = screen.getByRole('group', { name: /worked examples/i });
    expect(within(switcher).getByRole('button', { name: 'Hosting platform' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      within(switcher).getByRole('button', { name: 'Managed vs self-hosted Postgres' }),
    ).toHaveAttribute('aria-pressed', 'false');

    expect(screen.getByRole('button', { name: 'Export ADR' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument();
  });
});

describe('export ADR — same renderer as the CLI render-adr', () => {
  it('produces deterministic markdown for a seeded decision', async () => {
    const repository = createDemoRepository();
    const hosting = DEMO_EXAMPLES[0];
    if (hosting === undefined) throw new Error('expected at least one seeded example');
    const { filename, markdown } = await renderAdr(repository, hosting.decisionRef);
    expect(filename).toBe('dec-hosting.adr.md');
    expect(markdown).toMatch(/hosting platform/i);
    // A real ADR body, not an empty shell.
    expect(markdown.length).toBeGreaterThan(200);
  });
});
