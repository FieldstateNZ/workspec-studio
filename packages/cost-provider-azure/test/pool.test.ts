import { describe, expect, it } from 'vitest';
import { mapWithConcurrency } from '../src/pool.js';

/** Flush pending microtask callbacks a fixed number of times — deterministic (no timers), just draining the microtask queue so chained `await`s inside `mapWithConcurrency`'s workers get a chance to run. */
async function flushMicrotasks(times = 10): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve();
  }
}

/** A manually-resolvable promise, for tests that need to control settle order/timing without real timers. */
interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function makeDeferred<T>(): Deferred<T> {
  const box: { resolve?: (value: T) => void } = {};
  const promise = new Promise<T>((resolve) => {
    box.resolve = resolve;
  });
  // The executor above runs synchronously during `new Promise(...)`, so
  // `box.resolve` is always populated by this point.
  return { promise, resolve: (value: T) => box.resolve?.(value) };
}

/** Pop the next item off `queue`, or throw if it's unexpectedly empty — avoids a non-null assertion at call sites. */
function takeNext<T>(queue: T[]): T {
  const next = queue.shift();
  if (next === undefined) {
    throw new Error('takeNext: queue unexpectedly empty');
  }
  return next;
}

describe('mapWithConcurrency', () => {
  it('maps every item and preserves result order regardless of completion order', async () => {
    const first = makeDeferred<number>();
    const second = makeDeferred<number>();
    const third = makeDeferred<number>();
    const items = [first, second, third];

    const resultPromise = mapWithConcurrency(items, 3, (item) => item.promise);

    // Resolve out of input order — last item first, first item last — to
    // prove results are indexed by input position, not by settle order.
    third.resolve(200);
    await flushMicrotasks();
    second.resolve(100);
    await flushMicrotasks();
    first.resolve(0);

    await expect(resultPromise).resolves.toEqual([0, 100, 200]);
  });

  it('never runs more than `limit` invocations concurrently', async () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    const limit = 3;
    let inFlight = 0;
    let maxInFlight = 0;
    const pendingResolvers: (() => void)[] = [];

    const fn = (item: number): Promise<number> => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise((resolve) => {
        pendingResolvers.push(() => {
          inFlight -= 1;
          resolve(item);
        });
      });
    };

    const donePromise = mapWithConcurrency(items, limit, fn);

    // The pool starts `limit` workers synchronously (each blocks on its own
    // pending promise before returning control), so this holds without any
    // await at all.
    expect(inFlight).toBe(limit);
    expect(pendingResolvers).toHaveLength(limit);

    while (pendingResolvers.length > 0) {
      const resolve = takeNext(pendingResolvers);
      resolve();
      await flushMicrotasks();
      expect(inFlight).toBeLessThanOrEqual(limit);
    }

    const results = await donePromise;
    expect(results).toEqual(items);
    expect(maxInFlight).toBe(limit);
  });

  it('rejects with the first error and does not swallow it', async () => {
    const items = ['a', 'b', 'c'];
    const fn = (item: string): Promise<string> =>
      item === 'b' ? Promise.reject(new Error(`boom on ${item}`)) : Promise.resolve(item);

    await expect(mapWithConcurrency(items, 3, fn)).rejects.toThrow(/boom on b/);
  });

  it('clamps a non-positive limit (0, negative, -Infinity) or NaN up to 1 worker (never zero workers)', async () => {
    await expect(mapWithConcurrency([1, 2, 3], 0, (item) => Promise.resolve(item * 2))).resolves.toEqual([2, 4, 6]);
    await expect(mapWithConcurrency([1, 2, 3], -5, (item) => Promise.resolve(item * 2))).resolves.toEqual([2, 4, 6]);
    await expect(
      mapWithConcurrency([1, 2, 3], Number.NEGATIVE_INFINITY, (item) => Promise.resolve(item * 2)),
    ).resolves.toEqual([2, 4, 6]);
    await expect(mapWithConcurrency([1, 2, 3], Number.NaN, (item) => Promise.resolve(item * 2))).resolves.toEqual([
      2, 4, 6,
    ]);
  });

  it('runs -Infinity / NaN serially — maxInFlight stays at 1', async () => {
    for (const limit of [Number.NEGATIVE_INFINITY, Number.NaN]) {
      let maxInFlight = 0;
      let inFlight = 0;
      await mapWithConcurrency([1, 2, 3], limit, async (item) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await Promise.resolve();
        inFlight -= 1;
        return item;
      });
      expect(maxInFlight).toBe(1);
    }
  });

  it('clamps a limit larger than the item count down to the item count (behaves like an unbounded Promise.all)', async () => {
    let maxInFlight = 0;
    let inFlight = 0;
    const items = [1, 2, 3];

    await mapWithConcurrency(items, 100, async (item) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return item;
    });

    expect(maxInFlight).toBe(items.length);
  });

  it('treats Infinity as unbounded — every item runs at once (maxInFlight === items.length), not serial', async () => {
    let maxInFlight = 0;
    let inFlight = 0;
    const items = [1, 2, 3, 4, 5];

    await mapWithConcurrency(items, Number.POSITIVE_INFINITY, async (item) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return item;
    });

    expect(maxInFlight).toBe(items.length);
  });

  it('resolves to an empty array for an empty input without invoking fn', async () => {
    let calls = 0;
    const results = await mapWithConcurrency([], 4, () => {
      calls += 1;
      return Promise.resolve(calls);
    });
    expect(results).toEqual([]);
    expect(calls).toBe(0);
  });
});
