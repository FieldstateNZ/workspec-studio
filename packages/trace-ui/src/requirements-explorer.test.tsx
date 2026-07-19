import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RequirementsExplorer } from './requirements-explorer.js';
import { buildFixtureModel } from './test-helpers/trace-fixture.js';

describe('RequirementsExplorer', () => {
  it('renders a filter chip per bucket with the correct counts', () => {
    render(<RequirementsExplorer model={buildFixtureModel()} />);

    expect(screen.getByText('All · 7')).toBeInTheDocument();
    expect(screen.getByText('User reqs · 3')).toBeInTheDocument();
    expect(screen.getByText('Rules · 4')).toBeInTheDocument();
    // The count is the FULL finding total, not just findings that land on a
    // row: 2 orphan-userReq (audit-export, tap-support) + 1 empty-rule +
    // 1 orphan-feature (reporting, whose slug names no row) = 4.
    expect(screen.getByText('Diagnostics · 4')).toBeInTheDocument();
    // only unproven-rule has a scenario absent from the latest run
    expect(screen.getByText('Has untested · 1')).toBeInTheDocument();
  });

  it('the Diagnostics count equals the full model.findings total (no finding vanishes)', () => {
    const model = buildFixtureModel();
    render(<RequirementsExplorer model={model} />);
    expect(screen.getByText(`Diagnostics · ${model.findings.length}`)).toBeInTheDocument();
  });

  it('the Diagnostics filter surfaces the orphan-feature finding — which is tied to no row — with its message visible', () => {
    const model = buildFixtureModel();
    render(<RequirementsExplorer model={model} />);

    const orphanFeature = model.findings.find((f) => f.kind === 'orphan-feature');
    if (orphanFeature === undefined)
      throw new Error('expected an orphan-feature finding in fixture');
    // It carries the FEATURE's slug (`reporting`), so it attaches to no
    // userReq/Rule row and is never shown until we select Diagnostics.
    expect(screen.queryByText(orphanFeature.message)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Diagnostics · 4'));

    // Now its message renders explicitly, WITHOUT having to expand any row.
    expect(screen.getByText(orphanFeature.message)).toBeInTheDocument();
    expect(screen.getByText('orphan-feature')).toBeInTheDocument();
  });

  it('renders a row per userReq and per Rule, with kind, slug, and status', () => {
    render(<RequirementsExplorer model={buildFixtureModel()} />);

    expect(screen.getByText('Author an element without leaving the canvas')).toBeInTheDocument();
    // "authoring-flow" also appears as a "verifies" link chip on every Rule
    // row that verifies it — scope to the row's own slug label.
    expect(screen.getByText('authoring-flow', { selector: '.trace-row-slug' })).toBeInTheDocument();
    expect(screen.getByText('agreed')).toBeInTheDocument();

    expect(
      screen.getByText('Inline element creation', { selector: '.trace-row-title' }),
    ).toBeInTheDocument();
    expect(screen.getByText('inline-create', { selector: '.trace-row-slug' })).toBeInTheDocument();
    expect(screen.getByText('proven')).toBeInTheDocument();
    expect(screen.getByText('failing')).toBeInTheDocument();
    expect(screen.getByText('empty')).toBeInTheDocument();
  });

  it('filtering to "User reqs" hides Rule rows', () => {
    render(<RequirementsExplorer model={buildFixtureModel()} />);
    fireEvent.click(screen.getByText('User reqs · 3'));

    expect(screen.getByText('Author an element without leaving the canvas')).toBeInTheDocument();
    expect(screen.queryByText('Inline element creation')).not.toBeInTheDocument();
  });

  it('clicking a userReq row reveals its chain: every verifying Rule → its scenarios → proof', () => {
    render(<RequirementsExplorer model={buildFixtureModel()} />);
    fireEvent.click(screen.getByText('Author an element without leaving the canvas'));

    // All four fixture Rules verify authoring-flow — the chain lists all of them.
    expect(screen.getByText('verified by · 4 rules')).toBeInTheDocument();
    expect(
      screen.getByText('Inline element creation', { selector: '.trace-chain-rule-title' }),
    ).toBeInTheDocument();
    expect(screen.getByText('inline-create-persists')).toBeInTheDocument();
    expect(screen.getAllByText('pass').length).toBeGreaterThan(0);
    // The empty Rule's explicit case renders even nested inside a userReq's chain.
    expect(
      screen.getByText('This Rule has no scenarios yet — a requirement with no proof.'),
    ).toBeInTheDocument();
  });

  it('clicking an orphan userReq row shows the "no Rules verify this promise" empty chain AND its finding', () => {
    const model = buildFixtureModel();
    render(<RequirementsExplorer model={model} />);
    fireEvent.click(screen.getByText('Export the RTM as a compliance artifact'));

    expect(screen.getByText('No Rules verify this promise yet.')).toBeInTheDocument();

    const finding = model.findings.find(
      (f) => f.slug === 'audit-export' && f.kind === 'orphan-user-requirement',
    );
    if (finding === undefined)
      throw new Error('expected an orphan-user-requirement finding for audit-export');
    expect(screen.getByText(finding.message)).toBeInTheDocument();
  });

  it('clicking the empty Rule row shows the explicit "no scenarios yet" case, not a silent gap', () => {
    render(<RequirementsExplorer model={buildFixtureModel()} />);
    fireEvent.click(screen.getByText('A rule with no scenarios yet'));

    expect(
      screen.getByText('This Rule has no scenarios yet — a requirement with no proof.'),
    ).toBeInTheDocument();
  });

  it('clicking a Rule row again closes its chain', () => {
    render(<RequirementsExplorer model={buildFixtureModel()} />);
    const row = screen.getByText('A rule with no scenarios yet');
    fireEvent.click(row);
    expect(
      screen.getByText('This Rule has no scenarios yet — a requirement with no proof.'),
    ).toBeInTheDocument();
    fireEvent.click(row);
    expect(
      screen.queryByText('This Rule has no scenarios yet — a requirement with no proof.'),
    ).not.toBeInTheDocument();
  });

  it('renders the orphan-features footer', () => {
    render(<RequirementsExplorer model={buildFixtureModel()} />);
    expect(
      screen.getByText(/orphan feature.*reporting.*no userReqs or sysreqs yet/),
    ).toBeInTheDocument();
  });

  it('renders in both themes', () => {
    const model = buildFixtureModel();
    const dark = render(<RequirementsExplorer model={model} theme="dark" />);
    expect(dark.container.querySelector('.trace-root')).toHaveAttribute('data-theme', 'dark');
    dark.unmount();

    const light = render(<RequirementsExplorer model={model} theme="light" />);
    expect(light.container.querySelector('.trace-root')).toHaveAttribute('data-theme', 'light');
  });
});
