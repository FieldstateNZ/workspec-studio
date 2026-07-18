import { describe, expect, it } from 'vitest';
import { REQ_SCHEMA_PACKAGE } from './index.js';

describe('@workspec/req-schema', () => {
  it('exports its package identity', () => {
    expect(REQ_SCHEMA_PACKAGE).toBe('@workspec/req-schema');
  });
});
