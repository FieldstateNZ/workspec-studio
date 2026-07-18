import { describe, expect, it } from 'vitest';
import { TRACE_EMITTERS_PACKAGE } from './index.js';

describe('@workspec/trace-emitters', () => {
  it('exports its package identity', () => {
    expect(TRACE_EMITTERS_PACKAGE).toBe('@workspec/trace-emitters');
  });
});
