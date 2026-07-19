import { describe, expect, it } from 'vitest';
import {
  createMemoryRepository,
  DEFAULT_RUNS_DIR,
  FsRepository,
  run,
  TRACE_STUDIO_DEPENDENCIES,
  TRACE_STUDIO_PACKAGE,
} from './index.js';
import type { CliIO } from './index.js';

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

  it('wires against all four @workspec/* dependencies', () => {
    expect([...TRACE_STUDIO_DEPENDENCIES]).toEqual([
      '@workspec/schema-core',
      '@workspec/req-schema',
      '@workspec/trace-model',
      '@workspec/trace-emitters',
    ]);
  });

  it('re-exports the CLI, the FS repository, and its in-memory double', () => {
    expect(typeof run).toBe('function');
    expect(typeof FsRepository).toBe('function');
    expect(typeof createMemoryRepository).toBe('function');
    expect(DEFAULT_RUNS_DIR).toBe('.workspec/.runs');
  });

  it('run() prints usage and exits 0 with no command', async () => {
    const { io, out } = captureIO();
    const code = await run([], io);
    expect(code).toBe(0);
    expect(out()).toContain('workspec-trace');
  });
});
