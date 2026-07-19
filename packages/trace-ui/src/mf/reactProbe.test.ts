// Unit-level MF smoke coverage for `reactProbe`, the single-React-instance
// canary every Studio remote exposes (`./reactProbe`, mirrored from
// packages/cost-ui, packages/decision-ui, packages/c4-ui). The FULL
// cross-repo smoke test — a real host loading this package's BUILT
// `dist-mf/remoteEntry.js` over module federation and asserting one shared
// React across the boundary — lives at `apps/mf-host` (see its
// `tests/smoke.spec.ts`, which already proves this for the decision/c4/cost
// remotes). Wiring `traceStudio`'s remote into that host is out of this
// package's boundary (T5, #73 — `packages/trace-ui/**` only) and is a
// natural follow-up once T6/T7 round out the four views apps/mf-host would
// want to mount.
//
// What THIS test proves, self-contained: `reactProbe()`'s comparison logic —
// the exact mechanism apps/mf-host's Playwright assertions read off
// `data-same-instance` — correctly reports `true` when the "host" stamp is
// the SAME React module this package resolves (the steady state a correctly
// configured `shared: { react: { singleton: true } }` MF config produces),
// and `false` when it is a different object (the failure mode a duplicate
// React copy would produce, which is what actually breaks hooks at runtime).
import * as React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { reactProbe } from './reactProbe.js';

afterEach(() => {
  delete window.__DS_HOST_REACT;
});

describe('reactProbe', () => {
  it("reports sameInstance: true when the host stamped THIS package's own React", () => {
    window.__DS_HOST_REACT = React;
    const result = reactProbe();
    expect(result.sameInstance).toBe(true);
    expect(result.version).toBe(React.version);
  });

  it('reports sameInstance: false when no host React was stamped at all', () => {
    const result = reactProbe();
    expect(result.sameInstance).toBe(false);
  });

  it('reports sameInstance: false when the stamped React is a different object (the duplicate-React failure mode)', () => {
    window.__DS_HOST_REACT = { useState: () => [null, () => undefined], version: '18.3.1' };
    const result = reactProbe();
    expect(result.sameInstance).toBe(false);
  });
});
