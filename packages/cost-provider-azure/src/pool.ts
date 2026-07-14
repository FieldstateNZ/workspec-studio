// ── Bounded-concurrency fan-out ─────────────────────────────────────────────
// A small, dependency-free async pool: run `fn` over `items`, at most `limit`
// invocations in flight at once. `spend.ts` uses this to bound how many
// concurrent Azure Cost Management queries a single `fetchAzureSpend` call
// fires — an unbounded `Promise.all` fan-out sends every subscription's
// query at once, which amplifies 429 throttling even though `withRetry` (see
// `./http.ts`) honors `Retry-After` on each individual request.

/**
 * Map `items` through `fn`, running at most `limit` invocations concurrently.
 * `limit` is clamped to `[1, items.length]`, so it never produces zero
 * workers or more workers than there is work to do:
 *   - Any positive `limit` `>= items.length` — including `Infinity` — runs
 *     everything at once (unbounded, like a plain `Promise.all`).
 *   - `NaN`, `0`, a negative number, or `-Infinity` clamp UP to a single
 *     serial worker.
 *   - A fractional `limit` is floored (e.g. `2.9` → 2).
 *
 * Results preserve `items`' order (`results[i]` is always `fn(items[i], i)`'s
 * resolution), regardless of which order the underlying calls actually
 * settle in — so callers that don't care about order (e.g. `spend.ts`, which
 * sorts the merged rows afterward) get it for free, and callers that do can
 * rely on it.
 *
 * Rejects with the first error thrown by any `fn` call, same as
 * `Promise.all` — this never swallows a failure. Unlike `Promise.all`, a
 * failure doesn't cancel work already in flight (there is no cancellation
 * primitive here); it only stops the pool from *starting* new work, so the
 * rejection surfaces once every call in flight at that moment has settled.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  // `limit > 0` is false for NaN and 0/negative/-Infinity (those clamp to 1);
  // a positive limit — including +Infinity, where `Math.floor` is identity and
  // `Math.min` picks items.length — runs everything at once.
  const workerCount = Math.max(1, Math.min(items.length, limit > 0 ? Math.floor(limit) : 1));

  let nextIndex = 0;
  let failure: { error: unknown } | undefined;

  async function worker(): Promise<void> {
    for (;;) {
      if (failure !== undefined) return;
      const i = nextIndex;
      if (i >= items.length) return;
      nextIndex += 1;

      try {
        results[i] = await fn(items[i] as T, i);
      } catch (error) {
        if (failure === undefined) failure = { error };
        return;
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  if (failure !== undefined) throw failure.error;
  return results;
}
