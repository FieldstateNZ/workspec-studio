import { DefaultAzureCredential } from '@azure/identity';
import type { AccessToken, TokenCredential } from '@azure/identity';

// ── The HTTP seam ────────────────────────────────────────────────────────────
// We deliberately do NOT pull in the heavyweight `@azure/arm-*` SDKs (pinned
// design decision — see the package README). `@azure/identity` is used for
// auth ONLY; everything else is plain REST against ARM endpoints via global
// `fetch` (Node 22+), behind this injectable `AzureHttp` seam so every other
// module in this package (inventory/spend/apply/verify) — and every test —
// depends on an interface, never on `fetch` or `@azure/identity` directly.

/** One HTTP request, as `AzureHttp.request` sends it. */
export interface AzureHttpRequest {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  url: string;
  /** JSON-serializable request body. Omitted for GET. */
  body?: unknown;
  /** Extra headers to merge in (on top of Authorization/Content-Type). */
  headers?: Record<string, string>;
}

/** One HTTP response, as `AzureHttp.request` returns it. */
export interface AzureHttpResponse {
  status: number;
  /** Header names are lower-cased (matches the Fetch `Headers` iteration convention this package relies on, e.g. for `retry-after`). */
  headers: Record<string, string>;
  /** The parsed JSON body, or `undefined` for an empty body. */
  body: unknown;
}

/** The injectable seam every ARM/Resource-Graph/Cost-Management call in this package goes through. */
export interface AzureHttp {
  request(req: AzureHttpRequest): Promise<AzureHttpResponse>;
}

const MANAGEMENT_SCOPE = 'https://management.azure.com/.default';
/** Refresh the cached token this many ms before its recorded expiry, to avoid racing a request against expiry. */
const TOKEN_REFRESH_MARGIN_MS = 60_000;

/**
 * Wrap a `TokenCredential` in a small token cache: `@azure/identity`'s
 * credential classes don't cache `getToken()` themselves when used outside
 * `@azure/core-rest-pipeline` (which normally owns that caching), so calling
 * raw `fetch` per-request would otherwise re-authenticate on every call.
 */
function createTokenCache(credential: TokenCredential): () => Promise<string> {
  let cached: AccessToken | undefined;

  return async function getToken(): Promise<string> {
    const now = Date.now();
    if (cached === undefined || cached.expiresOnTimestamp - now < TOKEN_REFRESH_MARGIN_MS) {
      const token = await credential.getToken(MANAGEMENT_SCOPE);
      if (token === null) {
        throw new Error('createDefaultAzureHttp: failed to acquire an Azure AD token for management.azure.com');
      }
      cached = token;
    }
    return cached.token;
  };
}

/**
 * The real `AzureHttp`: authenticates via `DefaultAzureCredential` (or a
 * caller-supplied `TokenCredential` — env vars, managed identity, Azure CLI,
 * etc, per `@azure/identity`'s standard credential chain) and issues plain
 * `fetch` requests against `https://management.azure.com/...` URLs.
 */
export function createDefaultAzureHttp(credential: TokenCredential = new DefaultAzureCredential()): AzureHttp {
  const getToken = createTokenCache(credential);

  return {
    async request(req: AzureHttpRequest): Promise<AzureHttpResponse> {
      const token = await getToken();
      const res = await fetch(req.url, {
        method: req.method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...req.headers,
        },
        ...(req.body !== undefined ? { body: JSON.stringify(req.body) } : {}),
      });

      const headers: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });

      const text = await res.text();
      const body: unknown = text.length > 0 ? JSON.parse(text) : undefined;

      return { status: res.status, headers, body };
    },
  };
}

// ── Retry / backoff wrapper ──────────────────────────────────────────────────

/** Tuning knobs for {@link withRetry}, all optional and all injectable for deterministic tests. */
export interface RetryOptions {
  /** Total attempts before giving up (the first try plus retries). Default 5. */
  maxAttempts?: number;
  /** Base delay for exponential backoff, doubled per attempt. Default 500ms. */
  baseDelayMs?: number;
  /** Ceiling on the computed backoff delay (before jitter), regardless of attempt count. Default 30_000ms. */
  maxDelayMs?: number;
  /** Injectable sleep, so tests never actually wait. Defaults to a real `setTimeout`-backed sleep. */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable jitter source, returning a value in `[0, 1)`. Defaults to `Math.random`. Deterministic in tests. */
  jitter?: () => number;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** True for the HTTP statuses this package retries: 429 (throttled) and any 5xx (server error). */
function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

/**
 * Parse a `Retry-After` header value: either a number of seconds, or an
 * HTTP-date. Returns milliseconds to wait, or `undefined` if unparseable.
 */
function parseRetryAfterMs(value: string): number | undefined {
  const seconds = Number(value);
  if (!Number.isNaN(seconds)) {
    return Math.max(0, seconds * 1000);
  }
  const dateMs = Date.parse(value);
  if (Number.isNaN(dateMs)) {
    return undefined;
  }
  return Math.max(0, dateMs - Date.now());
}

/**
 * Wrap `http` with retry/backoff on 429/5xx: honors a `Retry-After` header
 * when present, otherwise backs off exponentially (`baseDelayMs * 2^attempt`,
 * capped at `maxDelayMs`, then jittered to `[50%, 100%]` of that value).
 * Bounded by `maxAttempts`; the last retryable response's status is thrown
 * as an `Error` once attempts are exhausted. Non-retryable responses (any
 * other status) are returned as-is on the first try — this wrapper never
 * inspects or transforms a successful/4xx-non-429 response.
 */
export function withRetry(http: AzureHttp, options: RetryOptions = {}): AzureHttp {
  const maxAttempts = options.maxAttempts ?? 5;
  const baseDelayMs = options.baseDelayMs ?? 500;
  const maxDelayMs = options.maxDelayMs ?? 30_000;
  const sleep = options.sleep ?? defaultSleep;
  const jitter = options.jitter ?? Math.random;

  return {
    async request(req: AzureHttpRequest): Promise<AzureHttpResponse> {
      for (let attempt = 0; ; attempt += 1) {
        const res = await http.request(req);
        if (!isRetryableStatus(res.status)) {
          return res;
        }
        if (attempt >= maxAttempts - 1) {
          throw new Error(
            `Azure request ${req.method} ${req.url} failed after ${attempt + 1} attempt(s): HTTP ${res.status}`,
          );
        }

        const retryAfterHeader = res.headers['retry-after'];
        const retryAfterMs = retryAfterHeader !== undefined ? parseRetryAfterMs(retryAfterHeader) : undefined;
        const backoffMs = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
        const delayMs = retryAfterMs ?? Math.round(backoffMs * (0.5 + jitter() * 0.5));

        await sleep(delayMs);
      }
    },
  };
}
