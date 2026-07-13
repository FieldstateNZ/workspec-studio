import { describe, expect, it } from 'vitest';
import { SpendArtifact, serializeSpendYaml } from '@workspec/cost-schema';
import { UNKNOWN_CURRENCY_PLACEHOLDER, fetchAzureSpend } from '../src/spend.js';
import { createFixtureHttp, loadFixture } from './support/fixture-http.js';

describe('fetchAzureSpend — Cost Management mapping + nextLink pagination', () => {
  it('pages via nextLink, maps unresolved rows, and reads currency from column metadata', async () => {
    const fixtures = await loadFixture('spend-single-sub-nextlink.json');
    const fixtureHttp = createFixtureHttp(fixtures);

    const spend = await fetchAzureSpend({ subscriptions: ['sub-A'] }, '2024-01', { http: fixtureHttp.http });

    fixtureHttp.assertExhausted();
    expect(fixtureHttp.requestsMade).toHaveLength(2);
    // The Cost Management `nextLink` is NOT GET-able (a GET returns HTTP 400
    // "Dataset is invalid or not supplied" — azure-rest-api-specs #12276):
    // the continuation must be POSTed, re-sending the original query body.
    expect(fixtureHttp.requestsMade[1]?.method).toBe('POST');
    expect(fixtureHttp.requestsMade[1]?.url).toBe(
      'https://management.azure.com/subscriptions/sub-A/providers/Microsoft.CostManagement/query?api-version=2024-08-01&$skiptoken=PAGE2',
    );
    expect(fixtureHttp.requestsMade[1]?.body).toEqual(fixtureHttp.requestsMade[0]?.body);

    // The first (POST) request carries the Custom timeframe + the exact
    // aggregation/grouping shape this package's design pins. (`fixture-http`
    // also deep-equals this against the fixture's own recorded `request.body`.)
    const firstBody = fixtureHttp.requestsMade[0]?.body as Record<string, unknown>;
    expect(firstBody).toMatchObject({
      type: 'ActualCost',
      timeframe: 'Custom',
      timePeriod: { from: '2024-01-01T00:00:00.000Z', to: '2024-01-31T23:59:59.999Z' },
      dataset: {
        granularity: 'None',
        aggregation: { totalCost: { name: 'Cost', function: 'Sum' } },
        grouping: [
          { type: 'Dimension', name: 'ResourceId' },
          { type: 'Dimension', name: 'ServiceName' },
        ],
      },
    });

    expect(spend.spec.rows).toEqual([
      {
        resourceId: '/subscriptions/sub-a/resourcegroups/rg1/providers/microsoft.compute/virtualmachines/vm1',
        amount: 100.5,
        currency: 'NZD',
        period: '2024-01',
        serviceCategory: 'Virtual Machines',
      },
      {
        resourceId: '/subscriptions/sub-a/resourcegroups/rg1/providers/microsoft.storage/storageaccounts/stg1',
        amount: 42,
        currency: 'NZD',
        period: '2024-01',
        serviceCategory: 'Storage',
      },
      {
        amount: 5.25,
        currency: 'NZD',
        period: '2024-01',
        serviceCategory: 'Reservations',
        unresolved: true,
        sourceLabel: 'Reservations',
      },
    ]);

    expect(SpendArtifact.safeParse(spend).success).toBe(true);
  });

  it('queries once per subscription and merges + sorts the combined rows', async () => {
    const fixtures = await loadFixture('spend-multi-sub.json');
    const fixtureHttp = createFixtureHttp(fixtures);

    const spend = await fetchAzureSpend({ subscriptions: ['sub-1', 'sub-2'] }, '2024-01', {
      http: fixtureHttp.http,
    });

    fixtureHttp.assertExhausted();
    expect(fixtureHttp.requestsMade).toHaveLength(2);
    expect(spend.spec.rows.map((r) => r.resourceId)).toEqual([
      '/subscriptions/sub-1/resourcegroups/rg1/providers/microsoft.compute/virtualmachines/vm1',
      '/subscriptions/sub-2/resourcegroups/rg1/providers/microsoft.compute/virtualmachines/vm2',
    ]);
    expect(spend.spec.rows.map((r) => r.currency)).toEqual(['NZD', 'AUD']);
  });

  it('falls back to UNKNOWN_CURRENCY_PLACEHOLDER when no currency-like column is present', async () => {
    const fixtures = await loadFixture('spend-missing-currency-column.json');
    const fixtureHttp = createFixtureHttp(fixtures);

    const spend = await fetchAzureSpend({ subscriptions: ['sub-1'] }, '2024-01', { http: fixtureHttp.http });

    expect(spend.spec.rows[0]?.currency).toBe(UNKNOWN_CURRENCY_PLACEHOLDER);
  });

  it('rejects an empty scope', async () => {
    await expect(
      fetchAzureSpend({ subscriptions: [] }, '2024-01', { http: createFixtureHttp([]).http }),
    ).rejects.toThrow(/scope.subscriptions must be non-empty/);
  });

  it('is byte-stable: two identical fetches serialize identically', async () => {
    const [fixturesA, fixturesB] = await Promise.all([
      loadFixture('spend-single-sub-nextlink.json'),
      loadFixture('spend-single-sub-nextlink.json'),
    ]);

    const spendA = await fetchAzureSpend({ subscriptions: ['sub-A'] }, '2024-01', {
      http: createFixtureHttp(fixturesA).http,
    });
    const spendB = await fetchAzureSpend({ subscriptions: ['sub-A'] }, '2024-01', {
      http: createFixtureHttp(fixturesB).http,
    });

    expect(serializeSpendYaml(spendA)).toBe(serializeSpendYaml(spendB));
  });
});
