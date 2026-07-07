import { describe, expect, it } from 'vitest';
import { STUDIO_TARGET_SCHEMA } from './index.js';

describe('@workspec/decision-studio', () => {
  it('targets the schema version via ui -> engine -> schema', () => {
    expect(STUDIO_TARGET_SCHEMA).toBe('v1alpha1');
  });
});
