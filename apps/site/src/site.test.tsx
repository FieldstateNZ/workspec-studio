import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { C4Stub } from './c4-stub.js';
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
    expect(screen.getByRole('link', { name: /coming/i })).toHaveAttribute('href', '/c4');
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

describe('c4 coming-soon stub (/c4)', () => {
  it('states what the module is and links each package to its GitHub source', () => {
    render(<C4Stub />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      /browse, validate, and render c4 architecture trees/i,
    );
    // Source links, NOT npm — the c4 packages aren't published yet, so an npm
    // href would 404 for anyone clicking through from the live page.
    const packagesBase = 'https://github.com/FieldstateNZ/workspec-studio/tree/main/packages';
    for (const pkg of ['c4-schema', 'c4-model', 'c4-layout']) {
      expect(screen.getByRole('link', { name: `@workspec/${pkg}` })).toHaveAttribute(
        'href',
        `${packagesBase}/${pkg}`,
      );
    }
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
