import { describe, expect, it } from 'vitest';
import { TRACE_UI_PACKAGE } from './index.js';

describe('@workspec/trace-ui', () => {
  it('exports its package identity', () => {
    expect(TRACE_UI_PACKAGE).toBe('@workspec/trace-ui');
  });
});
