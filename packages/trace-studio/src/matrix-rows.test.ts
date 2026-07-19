// Unit tests for the pure `TraceModel -> MatrixRow[]` projection: ordering,
// the empty-Rule placeholder row, and both dangling-ref fallbacks (a
// scenario's Rule ref, and a Rule's feature ref). Rendering (escaping,
// per-format golden output) is covered by the sibling
// `matrix-{markdown,csv,html}.test.ts` files — this file only asserts on the
// `MatrixRow[]` shape itself.

import { describe, expect, it } from 'vitest';
import { buildModel } from '@workspec/trace-model';
import { buildMatrixFixtureTree, buildMatrixFixtureRuns } from './matrix-fixture.js';
import { EMPTY_RULE_SCENARIO_LABEL, buildMatrixRows } from './matrix-rows.js';

describe('buildMatrixRows', () => {
  const model = buildModel(buildMatrixFixtureTree(), buildMatrixFixtureRuns());
  const rows = buildMatrixRows(model);

  it('emits one row per scenario in the tree, plus one per empty Rule', () => {
    // 6 scenarios (spec: every scenario in the tree, none dropped) + 1 empty Rule.
    expect(rows).toHaveLength(7);
  });

  it('orders rows by feature slug, then Rule slug, then scenario slug', () => {
    expect(rows.map((r) => r.scenario)).toEqual([
      'A scenario whose Rule ref is dangling', // feature '' (Rule unresolved) sorts first
      'A failing scenario', // element-authoring / inline-create / inline-create-fails
      'Creates and persists inline', // element-authoring / inline-create / inline-create-persists
      'Never reported by any run', // element-authoring / inline-create / unproven-scenario
      'A scenario title with a <tag> and a comma, plus "quotes"', // element-authoring / pipe-rule
      'Proves the dangling-feature rule', // ghost-feature / dangling-feature-rule
      EMPTY_RULE_SCENARIO_LABEL, // reporting / empty-rule (no scenario slug at all)
    ]);
  });

  it('resolves Feature/Rule/Verifies to their titles for a fully-wired scenario', () => {
    const row = rows.find((r) => r.scenario === 'Creates and persists inline');
    expect(row).toEqual({
      feature: 'Element authoring',
      rule: 'Inline element creation',
      scenario: 'Creates and persists inline',
      verifies: 'Author an element without leaving the canvas',
      status: 'pass',
      run: 'r1',
      sha: 'abc1234',
    });
  });

  it('joins multiple verified userReqs with "; ", in the Rule\'s stored (sorted) order', () => {
    const row = rows.find((r) => r.rule === 'A Rule | with a pipe');
    expect(row?.verifies).toBe(
      'Author an element without leaving the canvas; A promise with a "quote" inside',
    );
  });

  it('carries every scenario proof state distinctly: pass / fail / skip / unproven', () => {
    const byScenario = new Map(rows.map((r) => [r.scenario, r.status]));
    expect(byScenario.get('A failing scenario')).toBe('fail');
    expect(byScenario.get('Creates and persists inline')).toBe('pass');
    expect(byScenario.get('A scenario title with a <tag> and a comma, plus "quotes"')).toBe('skip');
    expect(byScenario.get('Never reported by any run')).toBe('unproven');
  });

  it('leaves Run/SHA empty for an unproven scenario', () => {
    const row = rows.find((r) => r.scenario === 'Never reported by any run');
    expect(row?.run).toBe('');
    expect(row?.sha).toBe('');
  });

  it('a dangling scenario -> Rule ref: Rule is shown as-authored; Feature and Verifies are empty', () => {
    const row = rows.find((r) => r.scenario === 'A scenario whose Rule ref is dangling');
    expect(row).toEqual({
      feature: '',
      rule: 'ghost-rule', // the raw ref, as-authored — no Rule node to title it from
      scenario: 'A scenario whose Rule ref is dangling',
      verifies: '',
      status: 'pass', // it still has evidence — the run keys on the scenario slug alone
      run: 'r1',
      sha: 'abc1234',
    });
  });

  it('a dangling Rule -> feature ref: only Feature falls back to the raw ref; the Rule itself still resolves', () => {
    const row = rows.find((r) => r.scenario === 'Proves the dangling-feature rule');
    expect(row).toEqual({
      feature: 'ghost-feature', // the raw ref, as-authored — no Feature node to name it from
      rule: 'A rule whose feature ref is dangling',
      scenario: 'Proves the dangling-feature rule',
      verifies: 'Author an element without leaving the canvas',
      status: 'pass',
      run: 'r1',
      sha: 'abc1234',
    });
  });

  it('an empty Rule contributes exactly one placeholder row: unproven, no Run/SHA', () => {
    const row = rows.find((r) => r.scenario === EMPTY_RULE_SCENARIO_LABEL);
    expect(row).toEqual({
      feature: 'Reporting, Audit & Compliance',
      rule: 'An empty rule with no scenarios',
      scenario: EMPTY_RULE_SCENARIO_LABEL,
      verifies: 'Author an element without leaving the canvas',
      status: 'unproven',
      run: '',
      sha: '',
    });
  });

  it('is deterministic: rebuilding from the same model yields an identical row array', () => {
    const again = buildMatrixRows(model);
    expect(again).toEqual(rows);
    expect(JSON.stringify(again)).toBe(JSON.stringify(rows));
  });
});
