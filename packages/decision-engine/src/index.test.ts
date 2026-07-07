import { describe, expect, it } from 'vitest';
import { ENGINE_TARGET_SCHEMA } from './index.js';

describe('@workspec/decision-engine', () => {
  it('targets the schema package version (dep direction: engine -> schema)', () => {
    expect(ENGINE_TARGET_SCHEMA).toBe('v1alpha1');
  });
});
