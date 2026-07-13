import { describe, expect, it } from 'vitest';
import { run } from './cli.js';
import type { CliIO } from './cli.js';

// Capturing IO double (factory-built per test).
function captureIO(): { io: CliIO; out: () => string; err: () => string } {
  let out = '';
  let err = '';
  return {
    io: { out: (t) => (out += t), err: (t) => (err += t) },
    out: () => out,
    err: () => err,
  };
}

describe('run', () => {
  it('prints the help stub and exits zero for help, --help, -h, and no command', async () => {
    for (const argv of [[], ['help'], ['--help'], ['-h']]) {
      const cap = captureIO();
      const code = await run(argv, cap.io);
      expect(code).toBe(0);
      expect(cap.out()).toContain('workspec-cost');
      expect(cap.err()).toBe('');
    }
  });

  it('errors and exits 1 on an unknown command', async () => {
    const cap = captureIO();
    const code = await run(['frobnicate'], cap.io);
    expect(code).toBe(1);
    expect(cap.err()).toContain('unknown command "frobnicate"');
    expect(cap.out()).toBe('');
  });
});
