import { describe, expect, it } from 'vitest';
import {
  buildModel,
  provenByOf,
  scenariosOf,
  sysreqsOf,
  userReqsOf,
  verifiersOf,
} from './index.js';
import type { ScenarioNode, SysReqNode, TraceModel, UserReqNode } from './index.js';
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
const scenarioNode = (model: TraceModel, slug: string): ScenarioNode =>
  must(model.scenarios.find((s) => s.slug === slug));

describe('golden: the worked example', () => {
  const model = buildModel(buildWorkedExample(), buildWorkedExampleRuns());

  it('selects the latest run by timestamp (not the all-passing older one)', () => {
    expect(model.latestRun).not.toBeNull();
    expect(model.latestRun?.id).toBe('2026-07-09T02-14Z');
    expect(model.latestRun?.sha).toBe('a1b2c3d');
  });

  it('scenarioCoverage: 6 of 7 scenarios have a result in the latest run', () => {
    expect(model.scenarioCoverage).toEqual({ numerator: 6, denominator: 7, ratio: 6 / 7 });
  });

  it('passRate: 4 of 6 evidenced scenarios pass (unproven excluded, skip counts as evidence)', () => {
    expect(model.passRate).toEqual({ numerator: 4, denominator: 6, ratio: 4 / 6 });
  });

  it('userReqCoverage is userReq-centric: 1 of 4 (only authoring-flow has a rule-proven verifier)', () => {
    expect(model.userReqCoverage).toEqual({ numerator: 1, denominator: 4, ratio: 0.25 });
  });

  it('the three meters are never collapsed to one number', () => {
    const ratios = [
      model.scenarioCoverage.ratio,
      model.userReqCoverage.ratio,
      model.passRate.ratio,
    ];
    expect(new Set(ratios).size).toBe(3);
  });

  it('scenario proof states: pass / fail / skip / unproven are all distinct', () => {
    expect(scenarioNode(model, 'inline-create-persists').proof).toBe('pass');
    expect(scenarioNode(model, 'failing-run-surfaced-scenario').proof).toBe('fail');
    expect(scenarioNode(model, 'outline-each-kind-scenario').proof).toBe('skip');
    // In the tree, absent from the latest run → unproven (the older run passed it).
    expect(scenarioNode(model, 'unproven-scenario').proof).toBe('unproven');
    expect(scenarioNode(model, 'unproven-scenario').evidence).toBeUndefined();
  });

  it('evidence is keyed on the scenario slug alone and carries the run it came from', () => {
    const node = scenarioNode(model, 'inline-create-persists');
    expect(node.evidence).toEqual({
      scenario: 'inline-create-persists',
      runId: '2026-07-09T02-14Z',
      status: 'pass',
      at: '2026-07-09T02:14:07Z',
      sha: 'a1b2c3d',
    });
  });

  it('ruleProven — all four cases: all-pass, one-failing, one-unproven, and empty', () => {
    expect(sysReq(model, 'inline-create').ruleProven).toBe(true); // all-pass
    expect(sysReq(model, 'failing-run-surfaced').ruleProven).toBe(false); // one-failing
    expect(sysReq(model, 'unproven-rule').ruleProven).toBe(false); // one-unproven
    expect(sysReq(model, 'empty-rule').ruleProven).toBe(false); // empty
    expect(sysReq(model, 'empty-rule').empty).toBe(true);
    expect(sysReq(model, 'inline-create').empty).toBe(false);
  });

  it('a rule with no scenarios is empty, regardless of whether it ruleProven-qualifies', () => {
    const empty = sysReq(model, 'empty-rule');
    expect(empty.scenarios).toEqual([]);
  });

  it('coverage predicate: a userReq is covered only via a rule-proven verifier', () => {
    expect(userReq(model, 'authoring-flow').covered).toBe(true);
    expect(userReq(model, 'authoring-flow').provenBy).toEqual(['inline-create']);
    // Verified only by non-rule-proven Rules → not covered, not orphan.
    expect(userReq(model, 'review-failures').covered).toBe(false);
    expect(userReq(model, 'review-failures').orphan).toBe(false);
  });

  it('the headline finding: an orphan userReq is an unverified promise', () => {
    const orphan = userReq(model, 'audit-export');
    expect(orphan.orphan).toBe(true);
    expect(orphan.verifiedBy).toEqual([]);
    expect(orphan.covered).toBe(false);
  });

  it('findings: 9 total — 2 duplicate-slug, 1 orphan-userReq, 1 orphan-feature, 1 empty-rule, 4 dangling-ref', () => {
    const byKind = new Map<string, number>();
    for (const f of model.findings) byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + 1);
    expect(Object.fromEntries(byKind)).toEqual({
      'duplicate-slug': 2,
      'orphan-user-requirement': 1,
      'orphan-feature': 1,
      'empty-rule': 1,
      'dangling-ref': 4,
    });
    expect(model.findings).toHaveLength(9);
  });

  it('dangling refs cover all five ref sites, including the new scenario→rule ref', () => {
    const dangling = model.findings
      .filter((f) => f.kind === 'dangling-ref')
      .map((f) => ({ slug: f.slug, field: f.field, ref: f.ref }));
    expect(dangling).toContainEqual({
      slug: 'ghost-actor-req',
      field: 'actor',
      ref: 'ghost-actor',
    });
    expect(dangling).toContainEqual({
      slug: 'dangling-refs-rule',
      field: 'feature',
      ref: 'nonexistent-feature',
    });
    expect(dangling).toContainEqual({
      slug: 'dangling-refs-rule',
      field: 'userReqs',
      ref: 'nonexistent-userreq',
    });
    expect(dangling).toContainEqual({
      slug: 'scenario-dangling-systemreq',
      field: 'systemRequirement',
      ref: 'nonexistent-rule',
    });
  });

  it('duplicate slug flags every colliding file and keeps derivation deterministic', () => {
    const dups = model.findings.filter((f) => f.kind === 'duplicate-slug');
    expect(dups.map((f) => f.file).sort()).toEqual([
      'requirements/system/failing-run-surfaced.copy.yml',
      'requirements/system/failing-run-surfaced.yml',
    ]);
    // Deduped to a single canonical Rule node despite the two files.
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
      'empty-rule',
      'inline-create',
      'outline-each-kind',
    ]);
    expect(userReqsOf(model, 'element-authoring').map((u) => u.slug)).toEqual([
      'audit-export',
      'authoring-flow',
      'ghost-actor-req',
    ]);
    expect(verifiersOf(model, 'authoring-flow').map((s) => s.slug)).toEqual([
      'empty-rule',
      'inline-create',
      'outline-each-kind',
    ]);
    expect(scenariosOf(model, 'inline-create').map((s) => s.slug)).toEqual([
      'inline-create-each-kind',
      'inline-create-persists',
    ]);
    expect(provenByOf(model, 'authoring-flow').map((s) => s.slug)).toEqual(['inline-create']);
    expect(sysreqsOf(model, 'no-such-feature')).toEqual([]);
    expect(scenariosOf(model, 'no-such-rule')).toEqual([]);
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
