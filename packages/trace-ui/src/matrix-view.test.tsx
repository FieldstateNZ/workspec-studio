import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { TraceModel } from '@workspec/trace-model';
import { MatrixView } from './matrix-view.js';
import { buildFixtureModel } from './test-helpers/trace-fixture.js';

/** A fully-covered, single-scenario-passing model: no orphans, no empty Rules — nothing "structural" for the untested-only filter to keep alive once its one scenario is filtered out. */
function buildFullyGreenModel(): TraceModel {
  return {
    latestRun: { id: 'run-1', ts: '2026-01-01T00:00:00Z', emitter: 'cucumber' },
    scenarios: [
      {
        slug: 'sc-green',
        title: 'A scenario that passes',
        systemRequirement: 'rule-green',
        proof: 'pass',
        evidence: {
          scenario: 'sc-green',
          runId: 'run-1',
          status: 'pass',
          at: '2026-01-01T00:00:00Z',
        },
        source: { file: 'scenarios/sc-green.yaml' },
      },
    ],
    systemRequirements: [
      {
        slug: 'rule-green',
        title: 'A rule that is fully proven',
        feature: 'feat-green',
        verifies: [],
        scenarios: ['sc-green'],
        ruleProven: true,
        empty: false,
        source: { file: 'requirements/system/rule-green.yaml' },
      },
    ],
    userRequirements: [],
    features: [
      {
        slug: 'feat-green',
        name: 'Green feature',
        userRequirements: [],
        systemRequirements: ['rule-green'],
        orphan: false,
        source: { file: 'features/feat-green.yaml' },
      },
    ],
    scenarioCoverage: { numerator: 1, denominator: 1, ratio: 1 },
    userReqCoverage: { numerator: 0, denominator: 0, ratio: 1 },
    passRate: { numerator: 1, denominator: 1, ratio: 1 },
    findings: [],
  };
}

/** One Rule with all four proof states, one scenario each — exercises every status cell distinctly. */
function buildAllProofStatesModel(): TraceModel {
  const evidence = (slug: string, status: 'pass' | 'fail' | 'skip') => ({
    scenario: slug,
    runId: 'run-1',
    status,
    at: '2026-01-01T00:00:00Z',
  });
  return {
    latestRun: { id: 'run-1', ts: '2026-01-01T00:00:00Z', emitter: 'cucumber' },
    scenarios: [
      {
        slug: 'sc-pass',
        title: 'A passing scenario',
        systemRequirement: 'rule-mixed',
        proof: 'pass',
        evidence: evidence('sc-pass', 'pass'),
        source: { file: 'scenarios/sc-pass.yaml' },
      },
      {
        slug: 'sc-fail',
        title: 'A failing scenario',
        systemRequirement: 'rule-mixed',
        proof: 'fail',
        evidence: evidence('sc-fail', 'fail'),
        source: { file: 'scenarios/sc-fail.yaml' },
      },
      {
        slug: 'sc-skip',
        title: 'A skipped scenario',
        systemRequirement: 'rule-mixed',
        proof: 'skip',
        evidence: evidence('sc-skip', 'skip'),
        source: { file: 'scenarios/sc-skip.yaml' },
      },
      {
        slug: 'sc-unproven',
        title: 'An unproven scenario',
        systemRequirement: 'rule-mixed',
        proof: 'unproven',
        source: { file: 'scenarios/sc-unproven.yaml' },
      },
    ],
    systemRequirements: [
      {
        slug: 'rule-mixed',
        title: 'A rule with mixed proof',
        feature: 'feat-mixed',
        verifies: [],
        scenarios: ['sc-pass', 'sc-fail', 'sc-skip', 'sc-unproven'],
        ruleProven: false,
        empty: false,
        source: { file: 'requirements/system/rule-mixed.yaml' },
      },
    ],
    userRequirements: [],
    features: [
      {
        slug: 'feat-mixed',
        name: 'Mixed feature',
        userRequirements: [],
        systemRequirements: ['rule-mixed'],
        orphan: false,
        source: { file: 'features/feat-mixed.yaml' },
      },
    ],
    scenarioCoverage: { numerator: 3, denominator: 4, ratio: 0.75 },
    userReqCoverage: { numerator: 0, denominator: 0, ratio: 1 },
    passRate: { numerator: 1, denominator: 3, ratio: 1 / 3 },
    findings: [],
  };
}

/** Locate the `.trace-chain-scenario-row` containing a given scenario slug, for scoped assertions on its own status pill. */
function scenarioRowFor(slug: string): HTMLElement {
  const slugEl = screen.getByText(slug, { selector: '.trace-chain-scenario-slug' });
  const row = slugEl.closest('.trace-chain-scenario-row');
  if (row === null) throw new Error(`expected a .trace-chain-scenario-row for ${slug}`);
  return row as HTMLElement;
}

describe('MatrixView', () => {
  it('groups scenarios under their Rule, and Rules under their Feature', () => {
    render(<MatrixView model={buildFixtureModel()} />);

    expect(screen.getByText('Element authoring')).toBeInTheDocument();
    expect(screen.getByText('Inline element creation')).toBeInTheDocument();
    expect(
      screen.getByText('inline-create-persists', { selector: '.trace-chain-scenario-slug' }),
    ).toBeInTheDocument();
    // Reporting has zero Rules — it still gets a feature row (the uncovered case, asserted below).
    expect(screen.getByText('Reporting')).toBeInTheDocument();
  });

  it('renders the correct status cell (proof) per scenario, distinctly', () => {
    render(<MatrixView model={buildAllProofStatesModel()} />);

    expect(within(scenarioRowFor('sc-pass')).getByText('pass')).toBeInTheDocument();
    expect(within(scenarioRowFor('sc-fail')).getByText('fail')).toBeInTheDocument();
    expect(within(scenarioRowFor('sc-skip')).getByText('skip')).toBeInTheDocument();
    expect(within(scenarioRowFor('sc-unproven')).getByText('unproven')).toBeInTheDocument();
    // Each row shows ITS OWN proof, not a shared/default value — cross-check
    // that the passing row does NOT also claim to have failed.
    expect(within(scenarioRowFor('sc-pass')).queryByText('fail')).not.toBeInTheDocument();
  });

  it('the untested-only filter hides proven/failing scenarios but keeps unproven ones and the structural empty-rule/uncovered-feature cases', () => {
    render(<MatrixView model={buildFixtureModel()} />);

    // Before filtering: every scenario in the fixture is visible.
    expect(
      screen.getByText('inline-create-persists', { selector: '.trace-chain-scenario-slug' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('flaky-scenario', { selector: '.trace-chain-scenario-slug' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText('Untested only · 1'));

    // The pass/fail scenarios are filtered out…
    expect(
      screen.queryByText('inline-create-persists', { selector: '.trace-chain-scenario-slug' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('flaky-scenario', { selector: '.trace-chain-scenario-slug' }),
    ).not.toBeInTheDocument();
    // …the unproven one stays…
    expect(
      screen.getByText('unproven-scenario', { selector: '.trace-chain-scenario-slug' }),
    ).toBeInTheDocument();
    // …and the structural diagnostics — an empty Rule and an uncovered
    // feature — are NEVER hidden by the filter (they aren't "tested or not",
    // they're coverage gaps the RTM must never let disappear).
    expect(
      screen.getByText('This Rule has no scenarios yet — a requirement with no proof.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('This feature has no system requirements yet — it is uncovered.'),
    ).toBeInTheDocument();
  });

  it('the untested-only filter renders the explicit "no scenarios match" empty state when nothing structural is left to show', () => {
    render(<MatrixView model={buildFullyGreenModel()} />);
    fireEvent.click(screen.getByText('Untested only · 0'));
    expect(screen.getByText('No scenarios match this filter.')).toBeInTheDocument();
    expect(screen.queryByText('Green feature')).not.toBeInTheDocument();
  });

  it('renders the EXPLICIT empty-rule case for a Rule with zero scenarios', () => {
    render(<MatrixView model={buildFixtureModel()} />);
    expect(
      screen.getByText('This Rule has no scenarios yet — a requirement with no proof.'),
    ).toBeInTheDocument();
  });

  it('renders the EXPLICIT uncovered-feature case for a feature with zero Rules', () => {
    render(<MatrixView model={buildFixtureModel()} />);
    expect(screen.getByText('Reporting')).toBeInTheDocument();
    expect(
      screen.getByText('This feature has no system requirements yet — it is uncovered.'),
    ).toBeInTheDocument();
  });

  it('renders "No features in this tree yet." when the model has no features', () => {
    const empty: TraceModel = {
      ...buildFullyGreenModel(),
      features: [],
      systemRequirements: [],
      scenarios: [],
    };
    render(<MatrixView model={empty} />);
    expect(screen.getByText('No features in this tree yet.')).toBeInTheDocument();
  });

  it('collapsing a feature hides its Rules; collapsing a Rule hides its scenarios', () => {
    render(<MatrixView model={buildFixtureModel()} />);

    expect(screen.getByText('Inline element creation')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Element authoring'));
    expect(screen.queryByText('Inline element creation')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Element authoring'));
    expect(screen.getByText('Inline element creation')).toBeInTheDocument();

    expect(
      screen.getByText('inline-create-persists', { selector: '.trace-chain-scenario-slug' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText('Inline element creation'));
    expect(
      screen.queryByText('inline-create-persists', { selector: '.trace-chain-scenario-slug' }),
    ).not.toBeInTheDocument();
  });

  it('points to the CLI export rather than offering an in-UI export button', () => {
    render(<MatrixView model={buildFixtureModel()} />);
    expect(screen.getByText(/workspec-trace matrix/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /export/i })).not.toBeInTheDocument();
  });

  it('renders in both themes', () => {
    const model = buildFixtureModel();
    const dark = render(<MatrixView model={model} theme="dark" />);
    expect(dark.container.querySelector('.trace-root')).toHaveAttribute('data-theme', 'dark');
    dark.unmount();

    const light = render(<MatrixView model={model} theme="light" />);
    expect(light.container.querySelector('.trace-root')).toHaveAttribute('data-theme', 'light');
  });
});
