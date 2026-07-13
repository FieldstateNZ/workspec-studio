import { describe, expect, it } from 'vitest';
import { TagPlanArtifact } from '@workspec/cost-schema';
import type { TagPlan } from '@workspec/cost-schema';
import { applyAzureTags } from '../src/apply.js';
import { createFixtureHttp, loadFixture } from './support/fixture-http.js';

const VM = (n: number): string =>
  `/subscriptions/sub-1/resourcegroups/rg1/providers/microsoft.compute/virtualmachines/vm${n}`;

function plan(): TagPlan {
  const candidate: TagPlan = {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'TagPlan',
    metadata: { id: 'plan-azure-1' },
    spec: {
      baselineAsOf: '2024-01-01T00:00:00.000Z',
      tagMapping: { product: 'env' },
      entries: [
        { resourceId: VM(1), tag: 'env', current: 'dev', desired: 'prod', action: 'change' },
        { resourceId: VM(1), tag: 'team', current: null, desired: 'atrium', action: 'add' },
        { resourceId: VM(2), tag: 'owner', current: 'alice', desired: null, action: 'remove' },
        { resourceId: VM(3), tag: 'env', current: null, desired: 'staging', action: 'add' },
        { resourceId: VM(4), tag: 'env', current: 'x', desired: 'x', action: 'noop' },
      ],
    },
  };
  const result = TagPlanArtifact.safeParse(candidate);
  if (!result.success) throw new Error('bad test fixture: plan');
  return result.data;
}

describe('applyAzureTags — grouping, dryRun, partial failure', () => {
  it('groups add+change into one Merge PATCH and remove into one Delete PATCH per resource, skips noop, continues past a failure', async () => {
    const fixtures = await loadFixture('apply-mixed.json');
    const fixtureHttp = createFixtureHttp(fixtures);

    const result = await applyAzureTags(plan(), { http: fixtureHttp.http });

    fixtureHttp.assertExhausted();
    expect(fixtureHttp.requestsMade).toHaveLength(3); // vm1 merge, vm2 delete, vm3 merge (fails) — vm4 noop sends nothing

    expect(result.dryRun).toBe(false);
    expect(result.skippedNoop).toBe(1);
    expect(result.applied).toBe(3); // vm1/env, vm1/team, vm2/owner
    expect(result.failed).toBe(1); // vm3/env

    // results[] is in the plan's own entries[] order, not per-resource-group batching order.
    expect(result.results.map((r) => `${r.tag}@${r.resourceId.split('/').pop()}`)).toEqual([
      'env@vm1',
      'team@vm1',
      'owner@vm2',
      'env@vm3',
      'env@vm4',
    ]);

    const vm3Result = result.results.find((r) => r.resourceId === VM(3));
    expect(vm3Result?.ok).toBe(false);
    expect(vm3Result?.error).toMatch(/500/);

    const vm4Result = result.results.find((r) => r.resourceId === VM(4));
    expect(vm4Result).toEqual({ resourceId: VM(4), tag: 'env', action: 'noop', ok: true });
  });

  it('dryRun makes no HTTP calls at all', async () => {
    const fixtureHttp = createFixtureHttp([]); // zero fixtures: any request would throw

    const result = await applyAzureTags(plan(), { http: fixtureHttp.http, dryRun: true });

    fixtureHttp.assertExhausted();
    expect(fixtureHttp.requestsMade).toHaveLength(0);
    expect(result.dryRun).toBe(true);
    expect(result.applied).toBe(4); // every non-noop entry "would" apply
    expect(result.failed).toBe(0);
    expect(result.skippedNoop).toBe(1);
    expect(result.results.every((r) => r.ok)).toBe(true);
  });

  it('rejects a structurally invalid TagPlan before issuing any request (all-or-nothing)', async () => {
    // Bypasses TagPlanArtifact's own validation via a cast — simulating a
    // hand-edited plan file: an "add" entry with `desired: null`, which the
    // schema's superRefine forbids. If this weren't rejected up front, this
    // entry would reach `nonNullDesired` mid-loop and throw OUTSIDE the
    // per-resource try/catch, after any earlier resources in the plan had
    // already been PATCHed live — exactly the partial-mutation bug this
    // validation exists to prevent.
    const invalidPlan = {
      ...plan(),
      spec: {
        ...plan().spec,
        entries: [{ resourceId: VM(1), tag: 'env', current: null, desired: null, action: 'add' }],
      },
    } as unknown as TagPlan;
    const fixtureHttp = createFixtureHttp([]); // zero fixtures: any request attempted would throw a DIFFERENT error

    await expect(applyAzureTags(invalidPlan, { http: fixtureHttp.http })).rejects.toThrow(
      /applyAzureTags: invalid TagPlan/,
    );

    fixtureHttp.assertExhausted();
    expect(fixtureHttp.requestsMade).toHaveLength(0);
  });
});
