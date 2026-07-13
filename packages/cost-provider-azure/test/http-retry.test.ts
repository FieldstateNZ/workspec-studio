import { describe, expect, it } from 'vitest';
import { withRetry } from '../src/http.js';
import type { AzureHttp, AzureHttpResponse } from '../src/http.js';

/** A scripted `AzureHttp`: returns each queued response in order, recording every call's timing via the injected sleep. */
function scriptedHttp(responses: readonly AzureHttpResponse[]): { http: AzureHttp; callCount: () => number } {
  const queue = [...responses];
  let calls = 0;
  return {
    callCount: () => calls,
    http: {
      request() {
        calls += 1;
        const next = queue.shift();
        if (next === undefined) throw new Error('scriptedHttp: exhausted');
        return Promise.resolve(next);
      },
    },
  };
}

describe('withRetry', () => {
  it('retries once on 429 then succeeds, honoring Retry-After exactly', async () => {
    const sleeps: number[] = [];
    const scripted = scriptedHttp([
      { status: 429, headers: { 'retry-after': '2' }, body: undefined },
      { status: 200, headers: {}, body: { ok: true } },
    ]);
    const http = withRetry(scripted.http, {
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
      jitter: () => 0.5,
    });

    const res = await http.request({ method: 'GET', url: 'https://example.test' });

    expect(res).toEqual({ status: 200, headers: {}, body: { ok: true } });
    expect(scripted.callCount()).toBe(2);
    expect(sleeps).toEqual([2000]); // Retry-After: 2 (seconds) takes precedence over computed backoff
  });

  it('retries on 5xx with computed exponential backoff + jitter when there is no Retry-After', async () => {
    const sleeps: number[] = [];
    const scripted = scriptedHttp([
      { status: 503, headers: {}, body: undefined },
      { status: 503, headers: {}, body: undefined },
      { status: 200, headers: {}, body: { ok: true } },
    ]);
    const http = withRetry(scripted.http, {
      baseDelayMs: 100,
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
      jitter: () => 0, // deterministic: delay = backoff * 0.5 exactly
    });

    const res = await http.request({ method: 'GET', url: 'https://example.test' });

    expect(res.status).toBe(200);
    expect(scripted.callCount()).toBe(3);
    // attempt 0 backoff = 100 * 2^0 = 100, * 0.5 jitter floor = 50
    // attempt 1 backoff = 100 * 2^1 = 200, * 0.5 jitter floor = 100
    expect(sleeps).toEqual([50, 100]);
  });

  it('gives up after maxAttempts and throws', async () => {
    const scripted = scriptedHttp([
      { status: 429, headers: {}, body: undefined },
      { status: 429, headers: {}, body: undefined },
      { status: 429, headers: {}, body: undefined },
    ]);
    const http = withRetry(scripted.http, {
      maxAttempts: 3,
      sleep: () => Promise.resolve(),
      jitter: () => 0,
    });

    await expect(http.request({ method: 'GET', url: 'https://example.test/x' })).rejects.toThrow(
      /failed after 3 attempt\(s\): HTTP 429/,
    );
    expect(scripted.callCount()).toBe(3);
  });

  it('never retries a non-retryable status (e.g. 404)', async () => {
    const scripted = scriptedHttp([{ status: 404, headers: {}, body: { error: 'not found' } }]);
    const http = withRetry(scripted.http, { sleep: () => Promise.reject(new Error('should not sleep')) });

    const res = await http.request({ method: 'GET', url: 'https://example.test' });

    expect(res.status).toBe(404);
    expect(scripted.callCount()).toBe(1);
  });
});
