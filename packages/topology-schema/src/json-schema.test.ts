import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildEnvironmentJsonSchema,
  buildResourceJsonSchema,
  buildTopologyJsonSchema,
  buildTopologyLayoutJsonSchema,
  serializeJsonSchema,
} from './index.js';

// src/ → topology-schema/ → packages/ → <repo root>/json-schema
const committedUrl = (file: string): string =>
  fileURLToPath(new URL(`../../../json-schema/${file}`, import.meta.url));

describe('generated JSON Schema', () => {
  it('topology schema is self-describing (dialect, $id, title)', () => {
    const s = buildTopologyJsonSchema();
    expect(s.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(s.$id).toBe('https://schema.workspec.io/v1alpha1/topology.schema.json');
    expect(s.title).toContain('Topology');
    expect(s.type).toBe('object');
  });

  it('resource schema is self-describing (dialect, $id, title)', () => {
    const s = buildResourceJsonSchema();
    expect(s.$id).toBe('https://schema.workspec.io/v1alpha1/resource.schema.json');
    expect(s.title).toContain('Resource');
  });

  it('environment schema is self-describing (dialect, $id, title)', () => {
    const s = buildEnvironmentJsonSchema();
    expect(s.$id).toBe('https://schema.workspec.io/v1alpha1/environment.schema.json');
    expect(s.title).toContain('Environment');
  });

  it('topology-layout schema is self-describing (dialect, $id, title)', () => {
    const s = buildTopologyLayoutJsonSchema();
    expect(s.$id).toBe('https://schema.workspec.io/v1alpha1/topology-layout.schema.json');
    expect(s.title).toContain('Layout');
  });

  // Drift check (this is the CI guard): regenerate in-memory and assert byte
  // equality with the committed files. Run `pnpm gen:schema` to update them.
  it('topology.schema.json committed file is up to date', () => {
    const committed = readFileSync(committedUrl('topology.schema.json'), 'utf8');
    expect(serializeJsonSchema(buildTopologyJsonSchema())).toBe(committed);
  });

  it('resource.schema.json committed file is up to date', () => {
    const committed = readFileSync(committedUrl('resource.schema.json'), 'utf8');
    expect(serializeJsonSchema(buildResourceJsonSchema())).toBe(committed);
  });

  it('environment.schema.json committed file is up to date', () => {
    const committed = readFileSync(committedUrl('environment.schema.json'), 'utf8');
    expect(serializeJsonSchema(buildEnvironmentJsonSchema())).toBe(committed);
  });

  it('topology-layout.schema.json committed file is up to date', () => {
    const committed = readFileSync(committedUrl('topology-layout.schema.json'), 'utf8');
    expect(serializeJsonSchema(buildTopologyLayoutJsonSchema())).toBe(committed);
  });
});
