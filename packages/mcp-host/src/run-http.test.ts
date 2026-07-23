// `runHttp` is the one piece of this package that actually binds a real
// socket, so it's tested separately from `cli.test.ts` (which only drives
// non-blocking paths — see that file's own comment for why). Uses an
// ephemeral port (`port: 0`) so the test never fights over a fixed port,
// and triggers the same shutdown path production uses (`SIGINT`/`SIGTERM`)
// via a synthetic `process.emit` rather than an actual OS signal — Node
// dispatches that to the registered `process.once('SIGTERM', ...)` listener
// exactly as a real signal would, without touching the real process, and
// the listener is consumed (`once`) so nothing leaks into later tests.
// `runHttp` registers its shutdown listeners synchronously (before its
// first `await`), so they're already in place by the time this test's own
// `emit` call runs.

import { describe, expect, it } from 'vitest';
import { runHttp } from './run-http.js';
import type { CliIO } from './cli.js';
import { buildFixtureTree } from './build-fixture-tree.js';

function silentIO(): CliIO {
  return { out: () => undefined, err: () => undefined };
}

describe('runHttp', () => {
  it('binds an ephemeral port and resolves 0 once the shutdown signal fires', async () => {
    const fixture = await buildFixtureTree();
    try {
      const promise = runHttp({ dir: fixture.dir, port: 0, host: '127.0.0.1' }, silentIO());

      process.emit('SIGTERM');

      const code = await promise;
      expect(code).toBe(0);
    } finally {
      await fixture.cleanup();
    }
  });

  it('resolves 1 and reports the port on an EADDRINUSE bind failure', async () => {
    const fixture = await buildFixtureTree();
    try {
      // This one needs a genuine collision, so a fixed (not ephemeral) port —
      // two servers can't both be assigned the same OS-picked port 0.
      const fixedPort = 41287;
      const holder = runHttp({ dir: fixture.dir, port: fixedPort, host: '127.0.0.1' }, silentIO());
      // Give the holder a tick to actually bind before the second attempt.
      await new Promise((resolve) => setImmediate(resolve));

      const lines: string[] = [];
      const capturingIo: CliIO = { out: () => undefined, err: (text) => lines.push(text) };
      const collidingCode = await runHttp({ dir: fixture.dir, port: fixedPort, host: '127.0.0.1' }, capturingIo);
      expect(collidingCode).toBe(1);
      expect(lines.join('')).toMatch(/port \d+ is in use/);

      process.emit('SIGTERM');
      await holder;
    } finally {
      await fixture.cleanup();
    }
  });
});
