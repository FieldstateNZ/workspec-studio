/**
 * Bind addresses that need no warning: a browser reaching the studio on one
 * of these sends a `Host` header the API's guard already allows, so
 * authoring works untouched.
 */
const LOOPBACK_BINDS: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

/** Wildcard binds — reachable under names the guard cannot know in advance. */
const WILDCARD_BINDS: ReadonlySet<string> = new Set(['0.0.0.0', '::', '[::]']);

/**
 * The startup warning for a non-loopback `--host <addr>`, or `null` when
 * none is needed.
 *
 * WHY THIS EXISTS. The API's DNS-rebinding guard allowlists loopback plus
 * the configured bind address. That makes `--host 192.168.1.5` work end to
 * end, but it cannot make a WILDCARD bind work: nobody browses to
 * `0.0.0.0`, they browse to the machine's LAN address or hostname, and the
 * guard has no way to know which. Left silent, that combination served a
 * page that loaded, rendered the model, and then 403'd every authoring
 * gesture — which reads as "the studio is broken", not "you bound a
 * wildcard". So the failure is announced up front, with the fix in it.
 *
 * A pure function, deliberately: `runServe` resolves only when the server
 * closes, so nothing inside it is reachable from a test without binding a
 * socket and killing the process. The message is the behaviour worth
 * pinning, so it lives out here where it can be asserted directly.
 */
export function bindHostWarning(host: string, port: number): string | null {
  if (LOOPBACK_BINDS.has(host)) return null;
  if (WILDCARD_BINDS.has(host)) {
    return (
      `  ! bound to the wildcard address ${host}: the API accepts requests whose Host header names localhost only.\n` +
      `    Browse via http://localhost:${String(port)}, or re-run with --host <the address you browse to>.\n`
    );
  }
  return `  ! bound to a non-loopback address: the API accepts requests whose Host header names localhost or ${host} only.\n`;
}
