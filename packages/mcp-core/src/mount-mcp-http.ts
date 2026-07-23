// Mounts an assembled MCP `Server` on an existing Express app, stateless and
// localhost-restricted — the shape every WorkSpec Studio host wants: a
// single-user, localhost-bound process with no session state worth keeping
// across requests.
//
// The low-level `Server` from `@modelcontextprotocol/sdk` only supports one
// connected transport at a time (`Protocol#connect` throws "Already
// connected to a transport" if called again before the previous transport
// closes — see `shared/protocol.js`). Stateless HTTP wants a fresh transport
// per request. Those two facts are reconciled here by serializing requests
// through a promise chain: each request's transport is connected, handled,
// and explicitly closed before the next request's `connect()` runs. For the
// single-user localhost hosts this targets, processing one MCP request at a
// time is not a meaningful limitation.
//
// DNS-rebinding + cross-origin protection is enforced by this module's own
// `isAllowedHost` / `isAllowedOrigin` pre-checks (hostname only, port
// stripped), NOT by the SDK transport's built-in
// `allowedHosts`/`allowedOrigins`/`enableDnsRebindingProtection` options — see
// `is-allowed-host.ts` for why (the SDK compares the whole `Host` header,
// port included, verbatim, which only works when the exact bound port is
// known ahead of the transport being constructed; ours generally isn't). A
// request with an off-allowlist `Host`, or a present-but-off-allowlist
// `Origin`, is rejected 403 before any transport sees it.

import type { Express, Request, Response } from 'express';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isAllowedHost, isAllowedOrigin } from './is-allowed-host.js';

/** Options for {@link mountMcpHttp}. */
export interface MountMcpHttpOptions {
  /** Path to mount the MCP endpoint at. Defaults to `/mcp`. */
  path?: string;
  /** Extra hosts allowed through DNS-rebinding protection, merged with the localhost defaults. */
  allowedHosts?: string[];
}

/** Hosts always allowed, regardless of what a caller passes in `opts.allowedHosts`. */
const DEFAULT_ALLOWED_HOSTS = ['127.0.0.1', 'localhost'];

/** A minimal JSON-RPC error body for requests rejected before a transport ever sees them. */
function jsonRpcError(code: number, message: string): { jsonrpc: '2.0'; error: { code: number; message: string }; id: null } {
  return { jsonrpc: '2.0', error: { code, message }, id: null };
}

/**
 * Handles one MCP HTTP request end to end: connect a fresh stateless
 * transport, hand it the request, then close it. Closing here (rather than
 * on `res`'s `close` event) is what guarantees the next queued request's
 * `connect()` sees `_transport` already cleared.
 */
async function handleMcpRequest(server: Server, req: Request, res: Response): Promise<void> {
  // No `sessionIdGenerator` key at all (rather than `sessionIdGenerator: undefined`):
  // the SDK's option type declares it as plain-optional (`() => string`, no explicit
  // `| undefined`), which trips our `exactOptionalPropertyTypes` if the key is present
  // with an `undefined` value. Omitting it is equivalent — the SDK's own doc comment
  // says "If not provided, session management is disabled (stateless mode)" — and
  // typechecks cleanly.
  //
  // `enableDnsRebindingProtection` is deliberately left off here: the Host-header
  // allowlist check already happened in `mountMcpHttp` before this function was
  // called (see `is-allowed-host.ts`), so enabling the SDK's own — stricter,
  // port-exact — check here would be redundant at best and would reject
  // legitimate requests at worst.
  const transport = new StreamableHTTPServerTransport({});
  try {
    // The SDK's `Transport` interface declares its callback properties as
    // plain-optional (`onclose?: () => void`, no explicit `| undefined`), but
    // `StreamableHTTPServerTransport`'s own accessors type them as
    // `(() => void) | undefined`. That mismatch only surfaces under our
    // `exactOptionalPropertyTypes: true` — the SDK itself doesn't build with
    // that flag. This would go away if the SDK's `Transport` interface used
    // `| undefined` explicitly on its optional callback properties.
    // @ts-expect-error — see comment above; SDK type mismatch under exactOptionalPropertyTypes.
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } finally {
    await transport.close();
  }
}

/**
 * Mounts the given MCP `Server` on `app`. POST is the only method the
 * stateless transport handles; GET and DELETE (session-stream and
 * session-teardown in the SDK's *stateful* mode) have no meaning here and
 * get an explicit 405, matching the SDK's own stateless example rather than
 * a bare 404 for a path that legitimately exists.
 */
export function mountMcpHttp(app: Express, server: Server, opts: MountMcpHttpOptions = {}): void {
  const path = opts.path ?? '/mcp';
  const allowedHosts = [...DEFAULT_ALLOWED_HOSTS, ...(opts.allowedHosts ?? [])];

  // Serializes MCP requests on this mount point — see the module doc comment
  // for why a single `Server` can't have two transports connected at once.
  let queue: Promise<void> = Promise.resolve();

  app.post(path, (req, res) => {
    if (!isAllowedHost(req.headers.host, allowedHosts)) {
      res.status(403).json(jsonRpcError(-32000, `Invalid Host header: ${req.headers.host ?? ''}`));
      return;
    }
    if (!isAllowedOrigin(req.headers.origin, allowedHosts)) {
      res
        .status(403)
        .json(jsonRpcError(-32000, `Invalid Origin header: ${req.headers.origin ?? ''}`));
      return;
    }
    const task = queue.then(
      () => handleMcpRequest(server, req, res),
      () => handleMcpRequest(server, req, res),
    );
    // Swallow so a failed request doesn't poison the chain for the next one;
    // the failure itself is still handled (and logged) below.
    queue = task.catch(() => undefined);
    task.catch((error: unknown) => {
      if (!res.headersSent) {
        res.status(500).json({ error: 'internal error' });
      }
      console.error('[mcp-core] unhandled MCP request error:', error);
    });
  });

  app.get(path, (_req, res) => {
    res.status(405).json(jsonRpcError(-32000, 'Method not allowed.'));
  });
  app.delete(path, (_req, res) => {
    res.status(405).json(jsonRpcError(-32000, 'Method not allowed.'));
  });
}
