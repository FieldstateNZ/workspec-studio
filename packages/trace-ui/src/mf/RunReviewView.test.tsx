// Smoke coverage for the `./RunReviewView` module-federation expose: proves
// the default export mounts and renders against a real `TraceModel`, the
// same way a federated host would consume it. Mirrors the level of coverage
// this package has for its other exposed views (none carry a dedicated
// per-file MF test today; this is the first, added alongside T7's Run
// review). The full cross-repo remote-loading smoke test lives at
// `apps/mf-host` (see `reactProbe.test.ts`'s doc comment for why that's out
// of this package's boundary).
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RunReviewView from './RunReviewView.js';
import { buildFixtureModel } from '../test-helpers/trace-fixture.js';

describe('./RunReviewView (MF expose)', () => {
  it('mounts and renders the run-metadata header for the given model', () => {
    render(<RunReviewView model={buildFixtureModel()} />);
    expect(screen.getByText('2026-07-09T02-14Z')).toBeInTheDocument();
    expect(screen.getByText('emitter cucumber')).toBeInTheDocument();
  });
});
