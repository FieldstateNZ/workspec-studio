import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { TraceModel } from '@workspec/trace-model';
import { RunReviewView } from './run-review-view.js';
import { buildFixtureModel, buildFixtureModelWithoutRuns } from './test-helpers/trace-fixture.js';

/**
 * One Rule, one scenario per proof state — a LOCAL fixture (not the shared
 * `test-helpers/trace-fixture.ts`, whose numbers other view tests hardcode;
 * `matrix-view.test.tsx` sets this precedent). Needed because the shared
 * fixture's one run never records a `skip` verdict, so it can't exercise
 * this view's Skipped section or prove the fail/skip/unproven/pass ordering
 * distinctly.
 */
function buildAllProofStatesModel(): TraceModel {
  const evidence = (slug: string, status: 'pass' | 'fail' | 'skip') => ({
    scenario: slug,
    runId: 'run-1',
    status,
    at: '2026-01-01T00:00:00Z',
  });
  return {
    latestRun: {
      id: 'run-1',
      ts: '2026-01-01T00:00:00Z',
      sha: 'abc1234',
      ci: 'github-actions',
      emitter: 'cucumber',
    },
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

/** A model whose only scenario passes — no fail/skip/unproven at all. */
function buildFullyGreenModel(): TraceModel {
  return {
    latestRun: { id: 'run-green', ts: '2026-02-02T00:00:00Z', emitter: 'junit' },
    scenarios: [
      {
        slug: 'sc-green',
        title: 'A scenario that passes',
        systemRequirement: 'rule-green',
        proof: 'pass',
        evidence: {
          scenario: 'sc-green',
          runId: 'run-green',
          status: 'pass',
          at: '2026-02-02T00:00:00Z',
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

describe('RunReviewView', () => {
  it('renders the run-metadata header: id, ts, sha, and emitter', () => {
    render(<RunReviewView model={buildFixtureModel()} />);
    expect(screen.getByText('2026-07-09T02-14Z')).toBeInTheDocument();
    expect(screen.getByText('2026-07-09T02:14:07Z')).toBeInTheDocument();
    expect(screen.getByText('a1b2c3d')).toBeInTheDocument();
    expect(screen.getByText('emitter cucumber')).toBeInTheDocument();
  });

  it('foregrounds failures first: sections render in fail → skip → unproven → pass document order', () => {
    render(<RunReviewView model={buildAllProofStatesModel()} />);
    const labels = screen
      .getAllByText(/^(Failures|Skipped|Unproven|Passing) · \d+$/)
      .map((el) => el.textContent);
    expect(labels).toEqual(['Failures · 1', 'Skipped · 1', 'Unproven · 1', 'Passing · 1']);
  });

  it('shows a failing scenario with fail styling and its Rule + Feature context', () => {
    render(<RunReviewView model={buildAllProofStatesModel()} />);
    const row = screen.getByText('sc-fail').closest('.trace-scenario-row');
    expect(row).not.toBeNull();
    const scoped = within(row as HTMLElement);
    expect(scoped.getByText('fail')).toBeInTheDocument();
    expect(scoped.getByText('Mixed feature › A rule with mixed proof')).toBeInTheDocument();
    // Would fail if this row were mislabelled as passing.
    expect(scoped.queryByText('pass')).not.toBeInTheDocument();
  });

  it('shows a skipped and an unproven scenario each in their own section, with the correct proof label', () => {
    render(<RunReviewView model={buildAllProofStatesModel()} />);

    const skipRow = screen.getByText('sc-skip').closest('.trace-scenario-row');
    expect(within(skipRow as HTMLElement).getByText('skip')).toBeInTheDocument();

    const unprovenRow = screen.getByText('sc-unproven').closest('.trace-scenario-row');
    expect(within(unprovenRow as HTMLElement).getByText('unproven')).toBeInTheDocument();
    expect(
      within(unprovenRow as HTMLElement).getByText('unproven — absent from the latest run'),
    ).toBeInTheDocument();
  });

  it('the Passing section is collapsed by default and expands on toggle', () => {
    render(<RunReviewView model={buildAllProofStatesModel()} />);
    expect(screen.queryByText('sc-pass')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Passing · 1'));
    expect(screen.getByText('sc-pass')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Passing · 1'));
    expect(screen.queryByText('sc-pass')).not.toBeInTheDocument();
  });

  it('renders the explicit no-run state when latestRun is null', () => {
    render(<RunReviewView model={buildFixtureModelWithoutRuns()} />);
    expect(screen.getByText('No evidence ingested yet.')).toBeInTheDocument();
    // None of the proof sections render without a run to review.
    expect(screen.queryByText(/^Failures ·/)).not.toBeInTheDocument();
  });

  it('renders the explicit positive all-passing state when nothing failed, was skipped, or is unproven', () => {
    render(<RunReviewView model={buildFullyGreenModel()} />);
    expect(
      screen.getByText('Every scenario passed in the latest run — nothing to foreground.'),
    ).toBeInTheDocument();
    // The three foregrounded sections are vacuous in this case — not rendered as three empty boxes.
    expect(screen.queryByText(/^Failures ·/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Skipped ·/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Unproven ·/)).not.toBeInTheDocument();
    // The passing scenario is still there to review, just collapsed.
    expect(screen.getByText('Passing · 1')).toBeInTheDocument();
    expect(screen.queryByText('sc-green')).not.toBeInTheDocument();
  });

  it('renders an explicit positive "no failures" message when there are failures-free but other proof states remain', () => {
    const model = buildAllProofStatesModel();
    const noFailModel: TraceModel = {
      ...model,
      scenarios: model.scenarios.filter((s) => s.proof !== 'fail'),
    };
    render(<RunReviewView model={noFailModel} />);
    expect(screen.getByText('No failures in this run.')).toBeInTheDocument();
    // But this is NOT the fully-vacuous all-passing case — skip/unproven still show.
    expect(screen.getByText('Skipped · 1')).toBeInTheDocument();
    expect(screen.getByText('Unproven · 1')).toBeInTheDocument();
  });

  it('renders in both themes', () => {
    const model = buildFixtureModel();
    const dark = render(<RunReviewView model={model} theme="dark" />);
    expect(dark.container.querySelector('.trace-root')).toHaveAttribute('data-theme', 'dark');
    dark.unmount();

    const light = render(<RunReviewView model={model} theme="light" />);
    expect(light.container.querySelector('.trace-root')).toHaveAttribute('data-theme', 'light');
  });
});
