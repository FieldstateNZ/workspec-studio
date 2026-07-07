import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Demo } from './demo.js';
import { renderAdr } from './export-adr.js';
import { Marketing } from './marketing.js';
import { DEMO_EXAMPLES, createDemoRepository } from './seed.js';

describe('marketing page', () => {
  it('renders the positioning and routes to the demo', () => {
    render(<Marketing />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      /costed architecture decisions/i,
    );
    expect(screen.getAllByRole('link', { name: /demo/i }).length).toBeGreaterThan(0);
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
    expect(hosting).toBeDefined();
    const { filename, markdown } = await renderAdr(repository, hosting!.decisionRef);
    expect(filename).toBe('dec-hosting.adr.md');
    expect(markdown).toMatch(/hosting platform/i);
    // A real ADR body, not an empty shell.
    expect(markdown.length).toBeGreaterThan(200);
  });
});
