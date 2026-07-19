import { describe, expect, it } from 'vitest';
import { TestRun } from './test-run.js';

function runFactory(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: '2026-07-09T02-14Z',
    ts: '2026-07-09T02:14:07Z',
    sha: 'a1b2c3d',
    ci: 'github-actions',
    emitter: 'cucumber',
    results: {
      'inline-create-persists': 'pass',
      'inline-create-each-kind': 'pass',
    },
    ...overrides,
  };
}

describe('TestRun', () => {
  it('accepts the §4.5 example', () => {
    expect(TestRun.safeParse(runFactory()).success).toBe(true);
  });

  it('accepts a run with only the required fields (sha/ci optional)', () => {
    const result = TestRun.safeParse({
      id: 'run-1',
      ts: '2026-07-09T02:14:07Z',
      emitter: 'junit',
      results: {},
    });
    expect(result.success).toBe(true);
  });

  it('accepts all three verdicts', () => {
    const result = TestRun.safeParse(runFactory({ results: { a: 'pass', b: 'fail', c: 'skip' } }));
    expect(result.success).toBe(true);
  });

  it('rejects a non-ISO-8601 ts', () => {
    const result = TestRun.safeParse(runFactory({ ts: '2026-07-09 02:14' }));
    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues[0]?.path).toEqual(['ts']);
  });

  it('rejects an empty id', () => {
    expect(TestRun.safeParse(runFactory({ id: '' })).success).toBe(false);
  });

  it('rejects an empty emitter', () => {
    expect(TestRun.safeParse(runFactory({ emitter: '' })).success).toBe(false);
  });

  it('rejects a verdict outside pass|fail|skip', () => {
    const result = TestRun.safeParse(runFactory({ results: { a: 'errored' } }));
    expect(result.success).toBe(false);
  });
});
