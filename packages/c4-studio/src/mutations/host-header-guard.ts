import type { RequestHandler } from 'express';

/**
 * Hostnames a request's `Host` header may name by default. The host binds
 * localhost unless `--host` says otherwise; this guard is the
 * DNS-rebinding backstop — a hostile page can make a victim's browser
 * resolve `evil.example` to 127.0.0.1 and fire same-"origin" requests at
 * the loopback server, and neither the bind address nor the absence of
 * CORS headers stops that. Port is deliberately ignored (it's picked at
 * `app.listen` time / ephemeral under test), mirroring
 * `@workspec/mcp-core`'s `is-allowed-host.ts` rationale — that helper is
 * internal to mcp-core, so the (deliberately tiny) comparison is restated
 * here.
 */
const LOOPBACK_HOSTNAMES: readonly string[] = ['127.0.0.1', 'localhost', '[::1]'];

/** Strips a `:port` suffix, keeping IPv6 brackets so `[::1]:4174` → `[::1]`. */
function hostnameOf(authority: string): string {
  if (authority.startsWith('[')) {
    const close = authority.indexOf(']');
    return close === -1 ? authority : authority.slice(0, close + 1);
  }
  const firstColon = authority.indexOf(':');
  if (firstColon === -1) return authority;
  if (firstColon !== authority.lastIndexOf(':')) return authority; // bare IPv6 — fails closed below
  return authority.slice(0, firstColon);
}

/**
 * Builds the Express middleware that rejects (403, before any handler side
 * effects) every request whose `Host` header names something outside the
 * allowlist. A missing header is rejected too — every real HTTP/1.1
 * request carries one; its absence is itself suspicious.
 *
 * SCOPE: `createServer` mounts this across the WHOLE `/api` surface, reads
 * included. An earlier revision guarded only the mutation routes on the
 * rationale that "the read routes serve nothing an attacker's browser
 * could not already induce" — that was wrong twice over. `GET /api/file`
 * hands a cross-origin page the contents of a developer's `.workspec/`
 * tree (an exfil no ordinary navigation grants it), and `PUT /api/file`
 * is itself a write route, so the write/read split did not even hold. The
 * guard now covers every `/api` route, and the mutation router mounts it
 * again on its own paths so that router is self-defending wherever it is
 * mounted.
 *
 * `extraHostnames` carries the configured `--host <addr>` bind address:
 * without it, binding a non-loopback address served a page that loaded
 * fine and then 403'd every authoring gesture. Matching is
 * case-insensitive; entries are compared after the same `:port` strip
 * applied to the request's own header. Note a WILDCARD bind (`0.0.0.0`,
 * `::`) is not a name any browser reaches the studio by, so it widens
 * nothing — `serve.ts` warns loudly at startup in that case.
 */
export function createHostHeaderGuard(extraHostnames: readonly string[] = []): RequestHandler {
  const allowed = new Set(
    [...LOOPBACK_HOSTNAMES, ...extraHostnames].map((name) => hostnameOf(name).toLowerCase()),
  );
  return (req, res, next) => {
    const host = req.headers.host;
    if (host === undefined || !allowed.has(hostnameOf(host).toLowerCase())) {
      res.status(403).json({ error: 'invalid Host header' });
      return;
    }
    next();
  };
}
