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

  describe('Cost Management retry header precedence', () => {
    it('prefers the QPU retry-after header over the consumption and generic headers', async () => {
      const sleeps: number[] = [];
      const scripted = scriptedHttp([
        {
          status: 429,
          headers: {
            'x-ms-ratelimit-microsoft.costmanagement-qpu-retry-after': '3',
            'x-ms-ratelimit-microsoft.consumption-retry-after': '9',
            'retry-after': '20',
          },
          body: undefined,
        },
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

      expect(res.status).toBe(200);
      expect(sleeps).toEqual([3000]);
    });

    it('uses the consumption retry-after header when the QPU header is absent', async () => {
      const sleeps: number[] = [];
      const scripted = scriptedHttp([
        {
          status: 429,
          headers: {
            'x-ms-ratelimit-microsoft.consumption-retry-after': '5',
            'retry-after': '20',
          },
          body: undefined,
        },
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

      expect(res.status).toBe(200);
      expect(sleeps).toEqual([5000]);
    });

    it('falls back to the generic retry-after header when both CM headers are absent', async () => {
      const sleeps: number[] = [];
      const scripted = scriptedHttp([
        { status: 429, headers: { 'retry-after': '7' }, body: undefined },
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

      expect(res.status).toBe(200);
      expect(sleeps).toEqual([7000]);
    });

    it('skips a present-but-unparseable QPU header and falls through to the consumption header', async () => {
      const sleeps: number[] = [];
      const scripted = scriptedHttp([
        {
          status: 429,
          headers: {
            'x-ms-ratelimit-microsoft.costmanagement-qpu-retry-after': 'not-a-valid-delay',
            'x-ms-ratelimit-microsoft.consumption-retry-after': '4',
            'retry-after': '20',
          },
          body: undefined,
        },
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

      expect(res.status).toBe(200);
      expect(sleeps).toEqual([4000]);
    });

    it('skips unparseable QPU and consumption headers and falls through to the generic header', async () => {
      const sleeps: number[] = [];
      const scripted = scriptedHttp([
        {
          status: 429,
          headers: {
            'x-ms-ratelimit-microsoft.costmanagement-qpu-retry-after': 'garbage',
            'x-ms-ratelimit-microsoft.consumption-retry-after': 'also-garbage',
            'retry-after': '6',
          },
          body: undefined,
        },
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

      expect(res.status).toBe(200);
      expect(sleeps).toEqual([6000]);
    });

    it('falls back to computed exponential backoff when no retry-after header parses', async () => {
      const sleeps: number[] = [];
      const scripted = scriptedHttp([
        {
          status: 429,
          headers: {
            'x-ms-ratelimit-microsoft.costmanagement-qpu-retry-after': 'garbage',
            'x-ms-ratelimit-microsoft.consumption-retry-after': 'also-garbage',
          },
          body: undefined,
        },
        { status: 200, headers: {}, body: { ok: true } },
      ]);
      const http = withRetry(scripted.http, {
        baseDelayMs: 100,
        sleep: (ms) => {
          sleeps.push(ms);
          return Promise.resolve();
        },
        jitter: () => 0,
      });

      const res = await http.request({ method: 'GET', url: 'https://example.test' });

      expect(res.status).toBe(200);
      // attempt 0 backoff = 100 * 2^0 = 100, * 0.5 jitter floor = 50
      expect(sleeps).toEqual([50]);
    });

    it('honors a CM header of "0" as a valid 0ms delay and does NOT fall through (guards ?? over ||)', async () => {
      const sleeps: number[] = [];
      const scripted = scriptedHttp([
        {
          status: 429,
          headers: {
            'x-ms-ratelimit-microsoft.costmanagement-qpu-retry-after': '0',
            // Lower-precedence candidates carry non-zero delays: if "0" were
            // treated as falsy (|| instead of ??), one of these would win.
            'x-ms-ratelimit-microsoft.consumption-retry-after': '9',
            'retry-after': '20',
          },
          body: undefined,
        },
        { status: 200, headers: {}, body: { ok: true } },
      ]);
      const http = withRetry(scripted.http, {
        baseDelayMs: 100,
        sleep: (ms) => {
          sleeps.push(ms);
          return Promise.resolve();
        },
        // A non-zero jitter would surface if we wrongly fell through to backoff.
        jitter: () => 0.5,
      });

      const res = await http.request({ method: 'GET', url: 'https://example.test' });

      expect(res.status).toBe(200);
      expect(scripted.callCount()).toBe(2);
      expect(sleeps).toEqual([0]); // exactly 0ms — QPU header won, no fall-through to 9000/20000 or backoff
    });

    it('honors a CM header carrying an HTTP-date value (parses via the Date branch)', async () => {
      const sleeps: number[] = [];
      // A clearly-future HTTP-date. toUTCString() truncates sub-second
      // precision, and parseRetryAfterMs measures against Date.now() at parse
      // time, so assert a tolerance band around the target rather than an
      // exact value to stay deterministic without controlling the clock.
      const targetMs = 30_000;
      const httpDate = new Date(Date.now() + targetMs).toUTCString();
      const scripted = scriptedHttp([
        {
          status: 429,
          headers: { 'x-ms-ratelimit-microsoft.costmanagement-qpu-retry-after': httpDate },
          body: undefined,
        },
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

      expect(res.status).toBe(200);
      expect(scripted.callCount()).toBe(2);
      expect(sleeps).toHaveLength(1);
      // Within [target - 2s, target]: allows for sub-second truncation and any
      // elapsed time between building the date and parsing it. A backoff/other
      // fallback would land well outside this band, so the Date branch is proven.
      expect(sleeps[0]).toBeGreaterThan(targetMs - 2_000);
      expect(sleeps[0]).toBeLessThanOrEqual(targetMs);
    });
  });
});
