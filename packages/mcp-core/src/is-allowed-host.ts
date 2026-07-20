// DNS-rebinding + cross-origin protection at the Express layer, rather than
// leaning on the MCP SDK transport's own `allowedHosts`/`allowedOrigins`. See
// `mount-mcp-http.ts`'s module doc comment for why: the SDK compares the
// entire `Host` header (hostname AND port) against the allowlist verbatim,
// which only works when the exact bound port is known ahead of the transport
// being constructed. A WorkSpec Studio host's port is decided at
// `app.listen(port, ...)` time (or is an ephemeral port picked by a test
// harness), long after `mountMcpHttp` runs — so an exact `host:port` allowlist
// can't be supplied here. Comparing hostnames only, port stripped, matches the
// intent (localhost-only) without needing the port.

/**
 * Normalizes a hostname for allowlist comparison: lowercased (hostnames are
 * case-insensitive, so `LOCALHOST` matches `localhost`) with a single
 * trailing dot stripped (the absolute-DNS form `localhost.` is the same host
 * as `localhost`). Applied to both sides of every comparison, so the
 * allowlist entries are normalized too.
 */
function normalizeHostname(hostname: string): string {
  const lower = hostname.toLowerCase();
  return lower.endsWith('.') ? lower.slice(0, -1) : lower;
}

/**
 * Extracts the hostname from an HTTP `Host` header value, stripping any
 * `:port` suffix. IPv6 literals are bracketed in a `Host` header
 * (`[::1]:4173`); the brackets are kept as part of the returned hostname so
 * an allowlist entry of `[::1]` matches and a bare `::1` never accidentally
 * does. An unbracketed value with multiple colons (a malformed bare IPv6) is
 * returned unchanged — it has no parseable port and won't match the
 * bracketed allowlist form, so it fails closed.
 */
function hostnameFromAuthority(authority: string): string {
  if (authority.startsWith('[')) {
    const close = authority.indexOf(']');
    return close === -1 ? authority : authority.slice(0, close + 1);
  }
  const firstColon = authority.indexOf(':');
  if (firstColon === -1) return authority; // no port
  if (firstColon !== authority.lastIndexOf(':')) return authority; // unbracketed IPv6, no port
  return authority.slice(0, firstColon);
}

/**
 * Whether an incoming request's `Host` header names one of `allowedHosts`,
 * ignoring the port and comparing case-/trailing-dot-insensitively. Returns
 * `false` (deny) when the header is missing — every real HTTP/1.1 request
 * carries one; its absence is itself suspicious.
 */
export function isAllowedHost(hostHeader: string | undefined, allowedHosts: string[]): boolean {
  if (hostHeader === undefined || hostHeader.length === 0) return false;
  const wanted = normalizeHostname(hostnameFromAuthority(hostHeader));
  return allowedHosts.some((allowed) => normalizeHostname(allowed) === wanted);
}

/**
 * Whether an incoming request's `Origin` header is acceptable. Only a truly
 * *absent* Origin is allowed — non-browser MCP clients (Claude Code, the stdio
 * bridge, curl) don't send the header at all, and Origin is a browser-enforced
 * signal. A *present* Origin (including a present-but-empty one) must parse as
 * an `http:`/`https:` URL whose hostname is in `allowedHosts` (same
 * hostname-only, port-tolerant matching as the Host check); anything else — an
 * empty value, an unparseable value like `null`, a non-HTTP scheme, or a
 * hostname off the allowlist (`https://evil.com`) — is denied. This is the
 * server-side backstop that stops a cross-origin browser page from driving the
 * MCP endpoint even when the Host header looks local.
 */
export function isAllowedOrigin(originHeader: string | undefined, allowedHosts: string[]): boolean {
  if (originHeader === undefined) return true; // header absent → non-browser client; empty string falls through to deny
  if (originHeader.length === 0) return false; // present but empty → deny (new URL('') would throw anyway)
  let url: URL;
  try {
    url = new URL(originHeader);
  } catch {
    return false; // present but unparseable (e.g. "null") → deny
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const wanted = normalizeHostname(url.hostname);
  return allowedHosts.some((allowed) => normalizeHostname(allowed) === wanted);
}
