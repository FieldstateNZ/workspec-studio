import { deepStrictEqual } from 'node:assert/strict';
import type { AzureHttp, AzureHttpRequest, AzureHttpResponse } from '../../src/http.js';

// ── The recorded-fixture replay harness ─────────────────────────────────────
// No live Azure call ever runs in this package's tests. Instead, each test
// scenario is a committed JSON array of `{ request, response }` pairs under
// `test/fixtures/`, and `createFixtureHttp` replays them in order: it asserts
// each actual request's method + url match the next recorded one, AND — when
// the recorded fixture's `request.body` is present — deep-equals the actual
// request body against it too, so a fixture can pin down an exact wire
// payload (e.g. a Cost Management `nextLink` continuation re-sending the
// original query body, or an ARM tags PATCH) rather than relying on a test
// reading `requestsMade` by hand. A fixture that omits `body` skips this
// check entirely (method + url only).

export interface FixtureRequest {
  method: AzureHttpRequest['method'];
  url: string;
  body?: unknown;
}

export interface FixtureResponse {
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface FixtureCall {
  request: FixtureRequest;
  response: FixtureResponse;
}

export interface FixtureHttp {
  http: AzureHttp;
  /** Every request actually made, in order — for tests that want to assert on request bodies. */
  requestsMade: AzureHttpRequest[];
  /** Throws if any recorded fixture was never consumed (a scenario didn't make as many calls as expected). */
  assertExhausted(): void;
}

/** Build a fake `AzureHttp` that replays `fixtures` in order. */
export function createFixtureHttp(fixtures: readonly FixtureCall[]): FixtureHttp {
  const queue = [...fixtures];
  const requestsMade: AzureHttpRequest[] = [];

  return {
    requestsMade,
    http: {
      request(req: AzureHttpRequest): Promise<AzureHttpResponse> {
        requestsMade.push(req);
        const next = queue.shift();
        if (next === undefined) {
          return Promise.reject(
            new Error(`createFixtureHttp: no more fixtures queued, but got ${req.method} ${req.url}`),
          );
        }
        if (next.request.method !== req.method || next.request.url !== req.url) {
          return Promise.reject(
            new Error(
              `createFixtureHttp: expected ${next.request.method} ${next.request.url}, got ${req.method} ${req.url}`,
            ),
          );
        }
        if (next.request.body !== undefined) {
          try {
            deepStrictEqual(req.body, next.request.body);
          } catch {
            return Promise.reject(
              new Error(
                `createFixtureHttp: request body mismatch for ${req.method} ${req.url}\n` +
                  `expected: ${JSON.stringify(next.request.body)}\n` +
                  `actual:   ${JSON.stringify(req.body)}`,
              ),
            );
          }
        }
        return Promise.resolve({
          status: next.response.status,
          headers: next.response.headers ?? {},
          body: next.response.body,
        });
      },
    },
    assertExhausted(): void {
      if (queue.length > 0) {
        throw new Error(`createFixtureHttp: ${queue.length} recorded fixture(s) were never consumed`);
      }
    },
  };
}

/** Load a committed fixture file (an array of {@link FixtureCall}) from `test/fixtures/`. */
export async function loadFixture(name: string): Promise<FixtureCall[]> {
  const { readFile } = await import('node:fs/promises');
  const url = new URL(`../fixtures/${name}`, import.meta.url);
  const text = await readFile(url, 'utf8');
  return JSON.parse(text) as FixtureCall[];
}
