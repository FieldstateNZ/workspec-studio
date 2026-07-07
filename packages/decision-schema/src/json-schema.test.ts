import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildCatalogJsonSchema, buildDecisionJsonSchema, serializeJsonSchema } from './index.js';

// src/ → schema/ → packages/ → <repo root>/json-schema
const committedUrl = (file: string): string =>
  fileURLToPath(new URL(`../../../json-schema/${file}`, import.meta.url));

describe('generated JSON Schema', () => {
  it('decision schema is self-describing (dialect, $id, title)', () => {
    const s = buildDecisionJsonSchema();
    expect(s.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(s.$id).toBe('https://schema.workspec.io/v1alpha1/decision.schema.json');
    expect(s.title).toContain('Decision');
    expect(s.type).toBe('object');
  });

  it('catalog schema is self-describing (dialect, $id, title)', () => {
    const s = buildCatalogJsonSchema();
    expect(s.$id).toBe('https://schema.workspec.io/v1alpha1/catalog.schema.json');
    expect(s.title).toContain('Catalog');
  });

  // Drift check (this is the CI guard): regenerate in-memory and assert byte
  // equality with the committed files. Run `pnpm gen:schema` to update them.
  it('decision.schema.json committed file is up to date', () => {
    const committed = readFileSync(committedUrl('decision.schema.json'), 'utf8');
    expect(serializeJsonSchema(buildDecisionJsonSchema())).toBe(committed);
  });

  it('catalog.schema.json committed file is up to date', () => {
    const committed = readFileSync(committedUrl('catalog.schema.json'), 'utf8');
    expect(serializeJsonSchema(buildCatalogJsonSchema())).toBe(committed);
  });
});
