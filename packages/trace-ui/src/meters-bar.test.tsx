import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MetersBar } from './meters-bar.js';
import { buildFixtureModel, buildFixtureModelWithoutRuns } from './test-helpers/trace-fixture.js';

describe('MetersBar', () => {
  it('shows all three meters, never collapsed, with correct N/M + percentage', () => {
    render(<MetersBar model={buildFixtureModel()} />);

    expect(screen.getByText('Scenario coverage')).toBeInTheDocument();
    expect(screen.getByText('UserReq coverage')).toBeInTheDocument();
    expect(screen.getByText('Pass rate')).toBeInTheDocument();

    // scenarioCoverage = 2/3 (unproven-scenario absent from the run)
    expect(screen.getByText('2 of 3 · 66.7%')).toBeInTheDocument();
    // passRate = 1/2 (inline-create-persists pass, flaky-scenario fail)
    expect(screen.getByText('1 of 2 · 50.0%')).toBeInTheDocument();
    // userReqCoverage = 1/3 (authoring-flow covered; audit-export + tap-support orphan)
    expect(screen.getByText('1 of 3 · 33.3%')).toBeInTheDocument();
  });

  it('renders the proof-tally summary line', () => {
    render(<MetersBar model={buildFixtureModel()} />);
    expect(screen.getByText('1 pass · 1 fail · 0 skip · 1 unproven')).toBeInTheDocument();
  });

  it('renders the vacuous 0/0 case as 100% when no runs have been ingested', () => {
    render(<MetersBar model={buildFixtureModelWithoutRuns()} />);
    // scenarioCoverage = 0/3 (nothing evidenced) and userReqCoverage = 0/3
    // (no Rule can be rule-proven with zero evidence) share the same figure —
    // passRate's denominator is also 0 (no evidenced scenarios), the vacuous
    // case the model defines as ratio 1 → 100%.
    expect(screen.getAllByText('0 of 3 · 0.0%')).toHaveLength(2);
    expect(screen.getByText('0 of 0 · 100.0%')).toBeInTheDocument();
  });

  it('renders in the dark theme', () => {
    const { container } = render(<MetersBar model={buildFixtureModel()} theme="dark" />);
    const root = container.querySelector('.trace-root');
    expect(root).toHaveAttribute('data-theme', 'dark');
    expect(root).toHaveClass('dark');
  });

  it('renders in the light theme', () => {
    const { container } = render(<MetersBar model={buildFixtureModel()} theme="light" />);
    const root = container.querySelector('.trace-root');
    expect(root).toHaveAttribute('data-theme', 'light');
    expect(root).not.toHaveClass('dark');
  });
});
