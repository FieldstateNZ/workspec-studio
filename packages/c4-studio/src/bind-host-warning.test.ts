// The `--host <addr>` startup warning (A2 final review, non-blocking finding).
//
// Before the fix the documented flag silently broke authoring: the page
// loaded and the model rendered, then every write returned
// `403 invalid Host header`. Two things changed — the guard now allowlists
// the configured bind address (covered in mutation-router.test.ts), and the
// case the guard CANNOT cover, a wildcard bind, is announced at startup.

import { describe, expect, it } from 'vitest';
import { bindHostWarning } from './bind-host-warning.js';

describe('bindHostWarning', () => {
  it('says nothing for a loopback bind — the default path is unchanged', () => {
    for (const host of ['127.0.0.1', 'localhost', '::1', '[::1]']) {
      expect(bindHostWarning(host, 4174), host).toBeNull();
    }
  });

  it('warns on a WILDCARD bind and names the fix, because the guard cannot cover it', () => {
    // Nobody browses to 0.0.0.0 — they browse to a LAN address the guard has
    // no way to know, so allowlisting the bind address buys nothing here.
    const warning = bindHostWarning('0.0.0.0', 4174);
    expect(warning).not.toBeNull();
    expect(warning).toContain('0.0.0.0');
    expect(warning).toContain('http://localhost:4174');
    expect(warning).toContain('--host <the address you browse to>');
  });

  it('warns on a specific non-loopback bind, stating exactly what IS accepted', () => {
    const warning = bindHostWarning('192.168.1.5', 4174);
    expect(warning).not.toBeNull();
    expect(warning).toContain('localhost or 192.168.1.5');
  });

  it('reports the ACTUAL bound port, not the requested one (--port 0)', () => {
    expect(bindHostWarning('0.0.0.0', 51234)).toContain('http://localhost:51234');
  });
});
