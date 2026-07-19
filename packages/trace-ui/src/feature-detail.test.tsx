import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FeatureDetail } from './feature-detail.js';
import { buildFixtureModel, buildFixtureModelWithoutRuns } from './test-helpers/trace-fixture.js';

describe('FeatureDetail', () => {
  it('defaults to the first feature and renders its Rule → scenarios tree', () => {
    render(<FeatureDetail model={buildFixtureModel()} />);

    expect(screen.getByRole('heading', { name: 'Element authoring' })).toBeInTheDocument();
    expect(
      screen.getByText('element-authoring · 4 rules · 3 scenarios · 2 userreqs'),
    ).toBeInTheDocument();

    // coverage = 2/3 evidenced, pass = 1/2 of those evidenced
    expect(screen.getByText('66.7%')).toBeInTheDocument();
    expect(screen.getByText('50.0%')).toBeInTheDocument();

    expect(screen.getByText('Inline element creation')).toBeInTheDocument();
    expect(screen.getByText('inline-create-persists')).toBeInTheDocument();
    // Both inline-create-persists (pass) and flaky-scenario (fail) were
    // evidenced by the SAME single fixture run, so their evidence lines are
    // identical text — two scenario rows, not a duplicate-rendering bug.
    expect(
      screen.getAllByText('proven by 2026-07-09T02-14Z · 2026-07-09T02:14:07Z · a1b2c3d'),
    ).toHaveLength(2);
    expect(screen.getByText('unproven — absent from the latest run')).toBeInTheDocument();
  });

  it('renders the userReqs attached to the selected feature', () => {
    render(<FeatureDetail model={buildFixtureModel()} />);
    expect(screen.getByText('Author an element without leaving the canvas')).toBeInTheDocument();
    expect(screen.getByText('Export the RTM as a compliance artifact')).toBeInTheDocument();
  });

  it('renders the provenance strip from the latest run', () => {
    render(<FeatureDetail model={buildFixtureModel()} />);
    expect(screen.getByText('2026-07-09T02-14Z')).toBeInTheDocument();
    expect(screen.getByText('emitter cucumber')).toBeInTheDocument();
  });

  it('renders "No runs ingested yet." when the model has no runs', () => {
    render(<FeatureDetail model={buildFixtureModelWithoutRuns()} />);
    expect(screen.getByText('No runs ingested yet.')).toBeInTheDocument();
  });

  it('renders the EXPLICIT empty-rule case for a Rule with zero scenarios', () => {
    render(<FeatureDetail model={buildFixtureModel()} />);
    expect(
      screen.getByText('This Rule has no scenarios yet — a requirement with no proof.'),
    ).toBeInTheDocument();
  });

  it('renders the EXPLICIT no-sysreq case for an uncovered feature', () => {
    render(<FeatureDetail model={buildFixtureModel()} featureSlug="reporting" />);

    expect(screen.getByRole('heading', { name: 'Reporting' })).toBeInTheDocument();
    expect(
      screen.getByText('reporting · uncovered — no system requirements yet'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('This feature has no system requirements yet — it is uncovered.'),
    ).toBeInTheDocument();
    // The feature still has an attached (orphan) userReq, rendered normally.
    expect(screen.getByText('TAP result support')).toBeInTheDocument();
  });

  it('the feature picker switches the displayed feature (uncontrolled)', () => {
    render(<FeatureDetail model={buildFixtureModel()} />);
    fireEvent.click(screen.getByText('Reporting'));
    expect(screen.getByRole('heading', { name: 'Reporting' })).toBeInTheDocument();
  });

  it('is controlled when featureSlug + onFeatureChange are both given', () => {
    const onFeatureChange = vi.fn();
    render(
      <FeatureDetail
        model={buildFixtureModel()}
        featureSlug="reporting"
        onFeatureChange={onFeatureChange}
      />,
    );

    fireEvent.click(screen.getByText('Element authoring'));
    expect(onFeatureChange).toHaveBeenCalledWith('element-authoring');
    // Still showing "Reporting" — the parent didn't re-render with the new slug.
    expect(screen.getByRole('heading', { name: 'Reporting' })).toBeInTheDocument();
  });

  it('renders in both themes', () => {
    const model = buildFixtureModel();
    const dark = render(<FeatureDetail model={model} theme="dark" />);
    expect(dark.container.querySelector('.trace-root')).toHaveAttribute('data-theme', 'dark');
    dark.unmount();

    const light = render(<FeatureDetail model={model} theme="light" />);
    expect(light.container.querySelector('.trace-root')).toHaveAttribute('data-theme', 'light');
  });
});
