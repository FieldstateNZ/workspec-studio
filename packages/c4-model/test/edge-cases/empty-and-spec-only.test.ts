import { describe, expect, it } from 'vitest';
import { loadC4Model } from '../../src/load-c4-model.js';
import { createMemorySource } from '../../src/sources/memory-source.js';
import { ELEMENT_KINDS } from '../../src/model/element-kind.js';

describe('empty tree', () => {
  it('loads with zero diagnostics and every kind empty', async () => {
    const model = await loadC4Model(createMemorySource({}));

    expect(model.diagnostics).toEqual([]);
    expect(model.diagrams).toEqual([]);
    expect(model.spec.path).toBeNull();
    for (const kind of ELEMENT_KINDS) {
      expect(model.elements[kind].size).toBe(0);
    }
  });
});

describe('tree with only spec.yaml', () => {
  it('loads the spec and nothing else, zero diagnostics', async () => {
    const model = await loadC4Model(
      createMemorySource({
        '.workspec/spec.yaml': 'type: style\nversion: 2\nelements:\n  actor:\n    accent: "#000"\n',
      }),
    );

    expect(model.diagnostics).toEqual([]);
    expect(model.spec.path).toBe('.workspec/spec.yaml');
    expect(model.spec.data.elements.actor?.accent).toBe('#000');
    expect(model.diagrams).toEqual([]);
    for (const kind of ELEMENT_KINDS) {
      expect(model.elements[kind].size).toBe(0);
    }
  });
});
