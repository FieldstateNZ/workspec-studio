import { describe, expect, it } from 'vitest';
import { UI_TARGET_SCHEMA } from './index.js';

describe('@workspec/decision-ui', () => {
  it('targets the schema version via the engine (dep direction: ui -> engine)', () => {
    expect(UI_TARGET_SCHEMA).toBe('v1alpha1');
  });
});
