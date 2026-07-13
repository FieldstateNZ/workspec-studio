// Render-free smoke test: C0 has no components yet, so there is nothing to
// mount. This only proves the package's own export plus the dependency-
// direction wiring (alias + tsconfig references) to cost-engine/cost-schema.
import { describe, expect, it } from 'vitest';
import { COST_ENGINE_PACKAGE } from '@workspec/cost-engine';
import { COST_SCHEMA_PACKAGE } from '@workspec/cost-schema';
import { COST_UI_PACKAGE } from './index.js';

describe('@workspec/cost-ui', () => {
  it('exports its package identity', () => {
    expect(COST_UI_PACKAGE).toBe('@workspec/cost-ui');
  });

  it('can import its cost-engine and cost-schema dependencies (proves alias + references wiring)', () => {
    expect(COST_ENGINE_PACKAGE).toBe('@workspec/cost-engine');
    expect(COST_SCHEMA_PACKAGE).toBe('@workspec/cost-schema');
  });
});
