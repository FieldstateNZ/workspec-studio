import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseActorYaml } from '../../src/yaml/parse-actor-yaml.js';
import { parseDiagramYaml } from '../../src/yaml/parse-diagram-yaml.js';
import { parseFeatureYaml } from '../../src/yaml/parse-feature-yaml.js';
import { parseLayoutYaml } from '../../src/yaml/parse-layout-yaml.js';
import { parseSpecYaml } from '../../src/yaml/parse-spec-yaml.js';

const fixtureRoot = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/invalid');

function read(relativePath: string): string {
  return readFileSync(join(fixtureRoot, relativePath), 'utf8');
}

describe('invalid fixtures', () => {
  it('actor-missing-description.yaml fails on the missing `description` field', () => {
    const result = parseActorYaml(read('actor-missing-description.yaml'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.path).toBe('description');
    }
  });

  it('diagram-bad-slug-ref-shape.yaml fails — a node cannot carry two typed-ref keys', () => {
    const result = parseDiagramYaml(read('diagram-bad-slug-ref-shape.yaml'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // A plain (non-discriminated) Zod union reports one root-level
      // `invalid_union` issue rather than per-branch paths — every branch
      // of Thin|Fat, and every typed-ref variant within Thin, rejected it.
      expect(result.errors[0]?.path).toBe('');
    }
  });

  it('spec-element-accent-number.yaml fails on the non-string `accent`', () => {
    const result = parseSpecYaml(read('spec-element-accent-number.yaml'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.path).toBe('elements.actor.accent');
      expect(result.errors[0]?.line).toBe(5);
    }
  });

  it('feature-missing-description.yaml fails on the missing `description` field', () => {
    const result = parseFeatureYaml(read('feature-missing-description.yaml'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.path).toBe('description');
    }
  });

  it('layout-negative-zoom.yaml fails on the non-positive `viewport.zoom`', () => {
    const result = parseLayoutYaml(read('layout-negative-zoom.yaml'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.path).toBe('viewport.zoom');
    }
  });

  it('layout-wrong-typed-coords.yaml fails on the string-typed node `x`', () => {
    const result = parseLayoutYaml(read('layout-wrong-typed-coords.yaml'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.path).toBe('nodes.architect.x');
    }
  });

  it('diagram-edge-missing-to.yaml fails — an edge without `to` matches neither Thin nor Fat', () => {
    const result = parseDiagramYaml(read('diagram-edge-missing-to.yaml'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.path).toBe('');
    }
  });

  it('element-external-boolean.yaml fails — `external: true` is not a recognized field', () => {
    const result = parseActorYaml(read('element-external-boolean.yaml'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.message).toContain('external');
    }
  });
});
