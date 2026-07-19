import { describe, expect, it } from 'vitest';
import { buildModel, sysreqsOf, userReqsOf, verifiersOf } from './index.js';
import type { SysReqNode, TraceModel, UserReqNode } from './index.js';
import { buildWorkedExample, buildWorkedExampleRuns } from './worked-example.fixture.js';

// The worked example IS the cross-implementation conformance artifact. The
// oracle assertions below pin the headline numbers (independently re-derived
// from the fixture — see its header) so a regression is obvious even without
// reading the snapshot diff.

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected value to be defined');
  return value;
}

const sysReq = (model: TraceModel, slug: string): SysReqNode =>
  must(model.systemRequirements.find((s) => s.slug === slug));
const userReq = (model: TraceModel, slug: string): UserReqNode =>
  must(model.userRequirements.find((u) => u.slug === slug));

describe('golden: the worked example', () => {
  const model = buildModel(buildWorkedExample(), buildWorkedExampleRuns());

  it('selects the latest run by timestamp (not the all-passing older one)', () => {
    expect(model.latestRun).not.toBeNull();
    expect(model.latestRun?.id).toBe('2026-07-09T02-14Z');
    expect(model.latestRun?.sha).toBe('a1b2c3d');
  });

  it('coverage is userReq-centric: 1 of 4 (only authoring-flow has a passing verifier)', () => {
    expect(model.coverage).toEqual({ numerator: 1, denominator: 4, ratio: 0.25 });
  });

  it('pass-rate is sysreq-centric: 2 of 5 evidenced sysreqs pass (unproven excluded)', () => {
    expect(model.passRate).toEqual({ numerator: 2, denominator: 5, ratio: 0.4 });
  });

  it('the two meters are never collapsed — coverage 25% sits under pass-rate 40%', () => {
    expect(model.coverage.ratio).not.toBe(model.passRate.ratio);
  });

  it('proof states: pass / fail / skip / unproven are all distinct', () => {
    expect(sysReq(model, 'inline-create-persists').proof).toBe('pass');
    expect(sysReq(model, 'inline-create-each-kind').proof).toBe('fail');
    expect(sysReq(model, 'outline-each-kind').proof).toBe('skip');
    // In the tree, absent from the latest run → unproven (the older run passed it).
    expect(sysReq(model, 'unproven-scenario').proof).toBe('unproven');
    expect(sysReq(model, 'unproven-scenario').evidence).toBeUndefined();
  });

  it('evidence is keyed on the sysreq slug alone and carries the run it came from', () => {
    const node = sysReq(model, 'inline-create-persists');
    expect(node.evidence).toEqual({
      sysreq: 'inline-create-persists',
      runId: '2026-07-09T02-14Z',
      status: 'pass',
      at: '2026-07-09T02:14:07Z',
      sha: 'a1b2c3d',
    });
  });

  it('coverage predicate: a userReq is covered only via a PASSING verifier', () => {
    expect(userReq(model, 'authoring-flow').covered).toBe(true);
    expect(userReq(model, 'authoring-flow').passingSysReqs).toEqual(['inline-create-persists']);
    // Verified only by a failing + an unproven sysreq → not covered, not orphan.
    expect(userReq(model, 'review-failures').covered).toBe(false);
    expect(userReq(model, 'review-failures').orphan).toBe(false);
  });

  it('the headline finding: an orphan userReq is an unverified promise', () => {
    const orphan = userReq(model, 'audit-export');
    expect(orphan.orphan).toBe(true);
    expect(orphan.verifiedBy).toEqual([]);
    expect(orphan.covered).toBe(false);
  });

  it('findings: 7 total — 2 duplicate-slug, 1 orphan-userReq, 1 orphan-feature, 3 dangling-ref', () => {
    const byKind = new Map<string, number>();
    for (const f of model.findings) byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + 1);
    expect(Object.fromEntries(byKind)).toEqual({
      'duplicate-slug': 2,
      'orphan-user-requirement': 1,
      'orphan-feature': 1,
      'dangling-ref': 3,
    });
    expect(model.findings).toHaveLength(7);
  });

  it('dangling refs are the three intra-tree ones; cross-layer links are never checked', () => {
    const dangling = model.findings
      .filter((f) => f.kind === 'dangling-ref')
      .map((f) => ({ slug: f.slug, field: f.field, ref: f.ref }));
    expect(dangling).toContainEqual({
      slug: 'ghost-actor-req',
      field: 'actor',
      ref: 'ghost-actor',
    });
    expect(dangling).toContainEqual({
      slug: 'dangling-refs-scenario',
      field: 'feature',
      ref: 'nonexistent-feature',
    });
    expect(dangling).toContainEqual({
      slug: 'dangling-refs-scenario',
      field: 'userReqs',
      ref: 'nonexistent-userreq',
    });
  });

  it('duplicate slug flags every colliding file and keeps derivation deterministic', () => {
    const dups = model.findings.filter((f) => f.kind === 'duplicate-slug');
    expect(dups.map((f) => f.file).sort()).toEqual([
      'requirements/system/failing-run-surfaced.copy.yml',
      'requirements/system/failing-run-surfaced.yml',
    ]);
    // Deduped to a single canonical sysreq node despite the two files.
    expect(model.systemRequirements.filter((s) => s.slug === 'failing-run-surfaced')).toHaveLength(
      1,
    );
  });

  it('orphan feature: reporting has neither userReqs nor sysreqs', () => {
    const reporting = must(model.features.find((f) => f.slug === 'reporting'));
    expect(reporting.orphan).toBe(true);
    expect(reporting.userRequirements).toEqual([]);
    expect(reporting.systemRequirements).toEqual([]);
  });

  it('lookups resolve groupings to nodes in canonical order', () => {
    expect(sysreqsOf(model, 'element-authoring').map((s) => s.slug)).toEqual([
      'inline-create-each-kind',
      'inline-create-persists',
      'outline-each-kind',
    ]);
    expect(userReqsOf(model, 'element-authoring').map((u) => u.slug)).toEqual([
      'audit-export',
      'authoring-flow',
      'ghost-actor-req',
    ]);
    expect(verifiersOf(model, 'authoring-flow').map((s) => s.slug)).toEqual([
      'inline-create-each-kind',
      'inline-create-persists',
      'outline-each-kind',
    ]);
    expect(sysreqsOf(model, 'no-such-feature')).toEqual([]);
  });

  it('is deterministic: same input → identical output', () => {
    const again = buildModel(buildWorkedExample(), buildWorkedExampleRuns());
    expect(again).toEqual(model);
    expect(JSON.stringify(again)).toBe(JSON.stringify(model));
  });

  it('matches the committed golden snapshot', () => {
    expect(model).toMatchSnapshot();
  });
});
