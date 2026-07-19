import { describe, expect, it } from 'vitest';
import { InventoryArtifact } from '@workspec/cost-schema';
import type { Inventory } from '@workspec/cost-schema';
import { kqlStringLiteral, verifyAzureBaseline } from '../src/verify.js';
import { createFixtureHttp, loadFixture } from './support/fixture-http.js';

function baseline(): Inventory {
  const candidate: Inventory = {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Inventory',
    metadata: { slug: 'baseline-1' },
    spec: {
      asOf: '2024-01-01T00:00:00.000Z',
      scope: { subscriptions: ['sub-1'] },
      resources: [
        { id: 'vm1', name: 'vm1', type: 't', location: 'l', resourceGroup: 'rg', subscription: 'sub-1', tags: { env: 'prod' } },
        { id: 'vm2', name: 'vm2', type: 't', location: 'l', resourceGroup: 'rg', subscription: 'sub-1', tags: { env: 'dev' } },
        { id: 'vm3', name: 'vm3', type: 't', location: 'l', resourceGroup: 'rg', subscription: 'sub-1' },
      ],
    },
  };
  const result = InventoryArtifact.safeParse(candidate);
  if (!result.success) throw new Error('bad test fixture: baseline');
  return result.data;
}

describe('verifyAzureBaseline — batched Resource Graph drift check', () => {
  it('detects all three drift kinds from one batched query', async () => {
    const fixtures = await loadFixture('verify-drift.json');
    const fixtureHttp = createFixtureHttp(fixtures);

    const report = await verifyAzureBaseline(baseline(), ['vm1', 'vm2', 'vm3', 'vm4'], { http: fixtureHttp.http });

    fixtureHttp.assertExhausted();
    expect(fixtureHttp.requestsMade).toHaveLength(1); // one batched query, not one per id

    expect(report.inSync).toBe(false);
    expect(report.drifts).toEqual(
      expect.arrayContaining([
        { kind: 'tags-changed', resourceId: 'vm1', detail: expect.stringContaining('prod') },
        { kind: 'resource-disappeared', resourceId: 'vm2', detail: expect.any(String) },
        { kind: 'resource-appeared', resourceId: 'vm4', detail: expect.any(String) },
      ]),
    );
    expect(report.drifts).toHaveLength(3); // vm3 untouched: no drift entry for it
  });

  it('defaults resourceIds to the baseline\'s own resources when omitted', async () => {
    // Same fixture, but only asking about the baseline's own ids means vm4
    // (a resourceIds-only addition) can never surface — proving the
    // default target-id set really is baseline-scoped.
    const fixtures = [
      {
        request: {
          method: 'POST' as const,
          url: 'https://management.azure.com/providers/Microsoft.ResourceGraph/resources?api-version=2022-10-01',
        },
        response: {
          status: 200,
          headers: {},
          body: { data: [{ id: 'vm1', tags: { env: 'prod' } }, { id: 'vm3', tags: null }] },
        },
      },
    ];
    const fixtureHttp = createFixtureHttp(fixtures);

    const report = await verifyAzureBaseline(baseline(), undefined, { http: fixtureHttp.http });

    expect(report.inSync).toBe(false);
    expect(report.drifts).toEqual([{ kind: 'resource-disappeared', resourceId: 'vm2', detail: expect.any(String) }]);
  });
});

describe('kqlStringLiteral — KQL injection hardening (CodeQL js/incomplete-sanitization)', () => {
  it('escapes quotes and backslashes so crafted ids cannot break out of the literal', () => {
    expect(kqlStringLiteral('/subscriptions/abc/resourcegroups/rg-1')).toBe(
      "'/subscriptions/abc/resourcegroups/rg-1'",
    );
    // A trailing backslash before a quote must not neutralize the quote escape:
    // raw input  foo\'  must become  'foo\\\''  (escaped backslash + escaped quote).
    expect(kqlStringLiteral("foo\\'")).toBe("'foo\\\\\\''");
    expect(kqlStringLiteral('back\\slash')).toBe("'back\\\\slash'");
  });
});
