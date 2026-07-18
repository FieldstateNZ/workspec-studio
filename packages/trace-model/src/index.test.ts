import { describe, expect, it } from 'vitest';
import { TRACE_MODEL_PACKAGE } from './index.js';

describe('@workspec/trace-model', () => {
  it('exports its package identity', () => {
    expect(TRACE_MODEL_PACKAGE).toBe('@workspec/trace-model');
  });
});
