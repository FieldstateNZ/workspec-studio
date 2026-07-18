import { describe, expect, it } from 'vitest';
import { run, TRACE_STUDIO_PACKAGE } from './index.js';
import type { CliIO } from './index.js';

// Capturing IO double, so this test never touches the real process streams.
function captureIO(): { io: CliIO; out: () => string; err: () => string } {
  let out = '';
  let err = '';
  return {
    io: { out: (t) => (out += t), err: (t) => (err += t) },
    out: () => out,
    err: () => err,
  };
}

describe('@workspec/trace-studio', () => {
  it('exports its package identity', () => {
    expect(TRACE_STUDIO_PACKAGE).toBe('@workspec/trace-studio');
  });

  it('run() prints usage and exits 0 (no verbs implemented yet — T0 skeleton)', async () => {
    const { io, out } = captureIO();
    const code = await run([], io);
    expect(code).toBe(0);
    expect(out()).toContain('workspec-trace');
    expect(out()).toContain('Usage');
  });
});
