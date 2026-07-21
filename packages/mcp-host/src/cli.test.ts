// Arg-parsing tests for `run(argv, io)`, the CLI's testable entry point.
// Deliberately exercises ONLY non-blocking paths: `--help` (returns before
// either transport starts) and argument-validation failures (also return
// before either transport starts, since `parseArgs`/`--port` validation
// happens before `runStdio`/`runHttp` are ever called). The stdio-default
// path is never driven here without `--help` — it would block reading
// stdin forever in a test process. The actual `--http` bind/listen path is
// covered separately in `run-http.test.ts` (ephemeral port, closed
// promptly) — no existing package in this repo had a real-bind CLI test to
// mirror (checked `decision-studio`'s `cli.test.ts`/`server.test.ts`: both
// stop at `--help`/argument-validation for `serve`, never actually bind),
// so this split (blocking transport tested at its own lower-level module,
// non-blocking arg-parsing tested through `run` itself) is this package's
// own call, made explicitly to avoid a hanging test process.

import { describe, expect, it } from 'vitest';
import { run } from './cli.js';
import type { CliIO } from './cli.js';

function captureIO(): { io: CliIO; out(): string; err(): string } {
  let out = '';
  let err = '';
  return {
    io: {
      out: (text) => {
        out += text;
      },
      err: (text) => {
        err += text;
      },
    },
    out: () => out,
    err: () => err,
  };
}

describe('workspec-mcp cli — arg parsing', () => {
  it('--help prints usage and exits 0 without starting either transport', async () => {
    const cap = captureIO();
    const code = await run(['--help'], cap.io);
    expect(code).toBe(0);
    expect(cap.out()).toContain('workspec-mcp');
    expect(cap.out()).toContain('--http');
    expect(cap.out()).toContain('--dir');
    expect(cap.out()).toContain('--port');
    expect(cap.out()).toContain('--host');
  });

  it('-h is the short form of --help', async () => {
    const cap = captureIO();
    const code = await run(['-h'], cap.io);
    expect(code).toBe(0);
    expect(cap.out()).toContain('workspec-mcp');
  });

  it('an unknown flag is a usage error (exit 2), reported on stderr', async () => {
    const cap = captureIO();
    const code = await run(['--bogus'], cap.io);
    expect(code).toBe(2);
    expect(cap.err()).toContain('workspec-mcp:');
  });

  it('--http --help returns before ever binding a socket', async () => {
    const cap = captureIO();
    const code = await run(['--http', '--help'], cap.io);
    expect(code).toBe(0);
    expect(cap.out()).toContain('workspec-mcp');
  });

  it('--http with an invalid --port is a usage error (exit 2), never binds', async () => {
    const cap = captureIO();
    const code = await run(['--http', '--port', 'not-a-number'], cap.io);
    expect(code).toBe(2);
    expect(cap.err()).toContain('invalid --port');
  });

  it('--http with a negative --port is a usage error (exit 2)', async () => {
    const cap = captureIO();
    // `--port=-1` (not `--port -1`, separate args): node:util's `parseArgs`
    // treats a bare `-1` after `--port` as ambiguous with a short-flag
    // combination and refuses to parse it at all.
    const code = await run(['--http', '--port=-1'], cap.io);
    expect(code).toBe(2);
    expect(cap.err()).toContain('invalid --port');
  });

  it('--http with an out-of-range --port is a usage error (exit 2)', async () => {
    const cap = captureIO();
    const code = await run(['--http', '--port', '99999'], cap.io);
    expect(code).toBe(2);
    expect(cap.err()).toContain('invalid --port');
  });

  it('--dir without a value is a usage error (exit 2)', async () => {
    const cap = captureIO();
    const code = await run(['--dir'], cap.io);
    expect(code).toBe(2);
    expect(cap.err()).toContain('workspec-mcp:');
  });
});
