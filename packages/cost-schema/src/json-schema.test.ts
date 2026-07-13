import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildInventoryJsonSchema,
  buildSpendJsonSchema,
  buildAttributionJsonSchema,
  buildTagPlanJsonSchema,
  serializeJsonSchema,
} from './index.js';

// src/ → cost-schema/ → packages/ → <repo root>/json-schema
const committedUrl = (file: string): string =>
  fileURLToPath(new URL(`../../../json-schema/${file}`, import.meta.url));

describe('generated JSON Schema', () => {
  it('inventory schema is self-describing (dialect, $id, title)', () => {
    const s = buildInventoryJsonSchema();
    expect(s.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(s.$id).toBe('https://schema.workspec.io/v1alpha1/inventory.schema.json');
    expect(s.title).toContain('Inventory');
    expect(s.type).toBe('object');
  });

  it('spend schema is self-describing (dialect, $id, title)', () => {
    const s = buildSpendJsonSchema();
    expect(s.$id).toBe('https://schema.workspec.io/v1alpha1/spend.schema.json');
    expect(s.title).toContain('Spend');
  });

  it('attribution schema is self-describing (dialect, $id, title)', () => {
    const s = buildAttributionJsonSchema();
    expect(s.$id).toBe('https://schema.workspec.io/v1alpha1/attribution.schema.json');
    expect(s.title).toContain('Attribution');
  });

  it('tagplan schema is self-describing (dialect, $id, title)', () => {
    const s = buildTagPlanJsonSchema();
    expect(s.$id).toBe('https://schema.workspec.io/v1alpha1/tagplan.schema.json');
    expect(s.title).toContain('TagPlan');
  });

  // Drift check (this is the CI guard): regenerate in-memory and assert byte
  // equality with the committed files. Run `pnpm gen:schema` to update them.
  it('inventory.schema.json committed file is up to date', () => {
    const committed = readFileSync(committedUrl('inventory.schema.json'), 'utf8');
    expect(serializeJsonSchema(buildInventoryJsonSchema())).toBe(committed);
  });

  it('spend.schema.json committed file is up to date', () => {
    const committed = readFileSync(committedUrl('spend.schema.json'), 'utf8');
    expect(serializeJsonSchema(buildSpendJsonSchema())).toBe(committed);
  });

  it('attribution.schema.json committed file is up to date', () => {
    const committed = readFileSync(committedUrl('attribution.schema.json'), 'utf8');
    expect(serializeJsonSchema(buildAttributionJsonSchema())).toBe(committed);
  });

  it('tagplan.schema.json committed file is up to date', () => {
    const committed = readFileSync(committedUrl('tagplan.schema.json'), 'utf8');
    expect(serializeJsonSchema(buildTagPlanJsonSchema())).toBe(committed);
  });
});
