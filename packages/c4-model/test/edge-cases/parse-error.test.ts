import { describe, expect, it } from 'vitest';
import { DIAGNOSTIC_CODES } from '../../src/model/diagnostic-codes.js';
import { loadC4Model } from '../../src/load-c4-model.js';
import { createMemorySource } from '../../src/sources/memory-source.js';

describe('parse-error', () => {
  it('a schema-invalid element file yields a parse-error with line/col and is absent from the model', async () => {
    const model = await loadC4Model(
      createMemorySource({
        // `description` is required (min 1) on actors — line 2 carries the violation's nearest node.
        '.workspec/actors/architect.yaml': 'title: Architect\nexternal: true\n',
      }),
    );

    const parseErrors = model.diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.parseError);
    expect(parseErrors.length).toBeGreaterThan(0);
    for (const diagnostic of parseErrors) {
      expect(diagnostic).toMatchObject({
        severity: 'error',
        file: '.workspec/actors/architect.yaml',
        slug: 'architect',
      });
      expect(diagnostic.line).toBeTypeOf('number');
      expect(diagnostic.col).toBeTypeOf('number');
    }
    expect(model.elements.actor.size).toBe(0);
  });

  it('a YAML syntax error yields a parse-error and the rest of the tree still loads', async () => {
    const model = await loadC4Model(
      createMemorySource({
        '.workspec/actors/broken.yaml': 'title: [unclosed\n',
        '.workspec/actors/fine.yaml': 'title: Fine\ndescription: Loads anyway.\n',
      }),
    );

    expect(
      model.diagnostics.some((d) => d.code === DIAGNOSTIC_CODES.parseError && d.line !== undefined),
    ).toBe(true);
    expect(model.elements.actor.has('fine')).toBe(true);
    expect(model.elements.actor.has('broken')).toBe(false);
  });
});
