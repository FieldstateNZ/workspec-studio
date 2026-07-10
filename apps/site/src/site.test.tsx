import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { userEvent } from '@testing-library/user-event';

import { C4 } from './c4.js';
import { C4Demo } from './c4-demo.js';
import { Decisions } from './decisions.js';
import { Demo } from './demo.js';
import { renderAdr } from './export-adr.js';
import { DEMO_EXAMPLES, createDemoRepository } from './seed.js';
import { StudioHome } from './studio-home.js';

describe('Studio landing page (/)', () => {
  it('renders the family pitch and links into both module pages', () => {
    render(<StudioHome />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      /workbench over the workspec artifacts/i,
    );
    expect(screen.getByRole('link', { name: /open decisions/i })).toHaveAttribute(
      'href',
      '/decisions',
    );
    expect(screen.getByRole('link', { name: /try the demo/i })).toHaveAttribute(
      'href',
      '/c4/demo',
    );
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

  it('nav lists both modules, matching Decisions’ nav (finding 07)', () => {
    render(<C4 />);
    expect(screen.getByRole('link', { name: 'Decisions' })).toHaveAttribute('href', '/decisions');
    expect(screen.getByRole('link', { name: 'C4 Diagrams' })).toHaveAttribute('href', '/c4');
  });
});

describe('c4 demo page (/c4/demo) — full-page demo shell, same pattern as Decisions’', () => {
  it('mounts a real C4Explorer over the representative example tree', async () => {
    render(<C4Demo />);
    expect(screen.getByText(/loading the demo tree/i)).toBeInTheDocument();

    // The explorer's tree nav lists both diagrams from the seeded tree.
    expect(await screen.findByRole('button', { name: /system context/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^container/i })).toBeInTheDocument();

    // The default (first) diagram's canvas rendered its elements.
    expect(await screen.findByText('Architect')).toBeInTheDocument();
    expect(screen.getByText('Payment Gateway')).toBeInTheDocument();
  });

  it('drill-down works: switching the tree nav swaps the rendered diagram', async () => {
    const user = userEvent.setup();
    render(<C4Demo />);

    await screen.findByText('Architect'); // system-context is showing first

    await user.click(screen.getByRole('button', { name: /^container/i }));

    // The container diagram's own elements now render…
    expect(await screen.findByText('Billing')).toBeInTheDocument();
    expect(screen.getByText('Primary Database')).toBeInTheDocument();
    // …and the system-context-only element is gone.
    expect(screen.queryByText('Payment Gateway')).not.toBeInTheDocument();
  });

  it('has the same demo-bar shell as Decisions’ demo — a back link, no embed chrome', () => {
    render(<C4Demo />);
    expect(
      screen.getByRole('link', { name: 'Back to the WorkSpec C4 Diagrams page' }),
    ).toHaveAttribute('href', '/c4');
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
