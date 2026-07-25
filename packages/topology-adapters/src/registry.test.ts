import { describe, expect, it } from 'vitest';
import { ADAPTERS } from './registry.js';

describe('ADAPTERS registry', () => {
  it('registers all three adapters by name', () => {
    expect(Object.keys(ADAPTERS).sort()).toEqual(
      ['azure-resource-graph', 'bicep', 'terraform'].sort(),
    );
  });

  it('every registered adapter is callable and returns the AdapterOutput shape for empty input', () => {
    for (const adapter of Object.values(ADAPTERS)) {
      expect(adapter({})).toEqual({ resources: [], diagnostics: [] });
    }
  });
});
