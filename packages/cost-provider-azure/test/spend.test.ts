import { describe, expect, it } from 'vitest';
import { SpendArtifact, serializeSpendYaml } from '@workspec/cost-schema';
import { UNKNOWN_CURRENCY_PLACEHOLDER, fetchAzureSpend } from '../src/spend.js';
import type { AzureHttp } from '../src/http.js';
import { createFixtureHttp, loadFixture } from './support/fixture-http.js';

/** A single-row Cost Management response body for a made-up subscription — enough shape to satisfy `rowsForSubscription`'s required columns. */
function oneRowResponseBody(subscriptionId: string, index: number): unknown {
  return {
    properties: {
      columns: [
        { name: 'Cost', type: 'Number' },
        { name: 'ResourceId', type: 'String' },
        { name: 'ServiceName', type: 'String' },
        { name: 'Currency', type: 'String' },
      ],
      rows: [
        [
          (index + 1) * 10,
          `/subscriptions/${subscriptionId}/resourceGroups/rg1/providers/Microsoft.Compute/virtualMachines/vm${index}`,
          'Virtual Machines',
          'NZD',
        ],
      ],
    },
  };
}

/** Flush pending microtask callbacks a fixed number of times — deterministic (no timers), just draining the microtask queue so the concurrency pool's chained `await`s get a chance to run. */
async function flushMicrotasks(times = 10): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve();
  }
}

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

  describe('maxConcurrency', () => {
    const subscriptionIds = ['sub-1', 'sub-2', 'sub-3', 'sub-4', 'sub-5'];

    function makeHttp(): AzureHttp {
      return {
        request(req) {
          const subscriptionId = /\/subscriptions\/([^/]+)\//.exec(req.url)?.[1];
          const index = subscriptionIds.indexOf(subscriptionId ?? '');
          return Promise.resolve({ status: 200, headers: {}, body: oneRowResponseBody(subscriptionId ?? '', index) });
        },
      };
    }

    it('merges + sorts identical rows whether serialized, at the default cap, or fully parallel (>= subscription count)', async () => {
      const scope = { subscriptions: subscriptionIds };

      const [serial, defaulted, allAtOnce] = await Promise.all([
        fetchAzureSpend(scope, '2024-01', { http: makeHttp(), maxConcurrency: 1 }),
        fetchAzureSpend(scope, '2024-01', { http: makeHttp() }), // omitted -> default (4)
        fetchAzureSpend(scope, '2024-01', { http: makeHttp(), maxConcurrency: subscriptionIds.length }),
      ]);

      expect(serial.spec.rows).toHaveLength(subscriptionIds.length);
      expect(defaulted.spec.rows).toEqual(serial.spec.rows);
      expect(allAtOnce.spec.rows).toEqual(serial.spec.rows);
    });

    it('treats maxConcurrency: 0 the same as omitting it (falls back to the default)', async () => {
      const scope = { subscriptions: subscriptionIds };

      const [zero, omitted] = await Promise.all([
        fetchAzureSpend(scope, '2024-01', { http: makeHttp(), maxConcurrency: 0 }),
        fetchAzureSpend(scope, '2024-01', { http: makeHttp() }),
      ]);

      expect(zero.spec.rows).toEqual(omitted.spec.rows);
    });

    it('never has more than maxConcurrency Cost Management requests in flight at once', async () => {
      const subscriptionCount = 10;
      const cap = 3;
      let inFlight = 0;
      let maxInFlight = 0;
      const pendingResolvers: (() => void)[] = [];

      const gatedHttp: AzureHttp = {
        request() {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          return new Promise((resolve) => {
            pendingResolvers.push(() => {
              inFlight -= 1;
              resolve({ status: 200, headers: {}, body: oneRowResponseBody('sub-x', 0) });
            });
          });
        },
      };

      const scope = { subscriptions: Array.from({ length: subscriptionCount }, (_, i) => `sub-${i}`) };
      const donePromise = fetchAzureSpend(scope, '2024-01', { http: gatedHttp, maxConcurrency: cap });

      // The pool starts `cap` workers synchronously before this line runs at
      // all — no await needed to observe the initial fan-out width.
      expect(inFlight).toBe(cap);
      expect(pendingResolvers).toHaveLength(cap);

      while (pendingResolvers.length > 0) {
        const resolve = pendingResolvers.shift();
        if (resolve === undefined) {
          throw new Error('pendingResolvers unexpectedly empty');
        }
        resolve();
        await flushMicrotasks();
        expect(inFlight).toBeLessThanOrEqual(cap);
      }

      const spend = await donePromise;
      expect(maxInFlight).toBe(cap);
      expect(spend.spec.rows).toHaveLength(subscriptionCount);
    });

    it('bounds in-flight requests to the default cap of 4 when maxConcurrency is OMITTED (guards against the default regressing to unbounded)', async () => {
      // Deliberately does NOT pass maxConcurrency — it exercises the default
      // path end to end. With 8 subscriptions, an unbounded fan-out would show
      // maxInFlight === 8, so this fails if DEFAULT_MAX_CONCURRENCY were
      // removed or the fallback became "all at once".
      const subscriptionCount = 8;
      const expectedDefaultCap = 4;
      let inFlight = 0;
      let maxInFlight = 0;
      const pendingResolvers: (() => void)[] = [];

      const gatedHttp: AzureHttp = {
        request() {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          return new Promise((resolve) => {
            pendingResolvers.push(() => {
              inFlight -= 1;
              resolve({ status: 200, headers: {}, body: oneRowResponseBody('sub-x', 0) });
            });
          });
        },
      };

      const scope = { subscriptions: Array.from({ length: subscriptionCount }, (_, i) => `sub-${i}`) };
      const donePromise = fetchAzureSpend(scope, '2024-01', { http: gatedHttp }); // no maxConcurrency

      // The pool starts exactly the default number of workers synchronously.
      expect(inFlight).toBe(expectedDefaultCap);
      expect(pendingResolvers).toHaveLength(expectedDefaultCap);

      while (pendingResolvers.length > 0) {
        const resolve = pendingResolvers.shift();
        if (resolve === undefined) {
          throw new Error('pendingResolvers unexpectedly empty');
        }
        resolve();
        await flushMicrotasks();
        expect(inFlight).toBeLessThanOrEqual(expectedDefaultCap);
      }

      const spend = await donePromise;
      expect(maxInFlight).toBe(expectedDefaultCap);
      expect(spend.spec.rows).toHaveLength(subscriptionCount);
    });

    it('rejects if any subscription fetch fails (reject-on-any-error, same as the old Promise.all fan-out)', async () => {
      const scope = { subscriptions: ['sub-ok-1', 'sub-bad', 'sub-ok-2'] };
      const http: AzureHttp = {
        request(req) {
          if (req.url.includes('sub-bad')) {
            return Promise.resolve({ status: 500, headers: {}, body: undefined });
          }
          return Promise.resolve({ status: 200, headers: {}, body: oneRowResponseBody('sub-ok', 0) });
        },
      };

      await expect(fetchAzureSpend(scope, '2024-01', { http, maxConcurrency: 2 })).rejects.toThrow(
        /Cost Management query failed for "sub-bad": HTTP 500/,
      );
    });
  });
});
