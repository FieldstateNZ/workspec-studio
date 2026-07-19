import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  parseInventoryYaml,
  parseSpendYaml,
  parseAttributionYaml,
  parseTagPlanYaml,
  serializeInventoryYaml,
  serializeSpendYaml,
  serializeAttributionYaml,
  serializeTagPlanYaml,
} from './index.js';
import { invalidCases } from './invalid-fixtures.expected.js';
import type { InvalidCase } from './invalid-fixtures.expected.js';

// src/ → cost-schema/ → test/fixtures
const validUrl = (file: string): string =>
  fileURLToPath(new URL(`../test/fixtures/valid/${file}`, import.meta.url));
const invalidUrl = (file: string): string =>
  fileURLToPath(new URL(`../test/fixtures/invalid/${file}`, import.meta.url));

const read = (path: string): string => readFileSync(path, 'utf8');

/** Narrows a possibly-undefined lookup/index result, failing the test loudly if absent. */
function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected value to be defined');
  return value;
}

function parseFor(kind: InvalidCase['kind']) {
  switch (kind) {
    case 'inventory':
      return parseInventoryYaml;
    case 'spend':
      return parseSpendYaml;
    case 'attribution':
      return parseAttributionYaml;
    case 'tagplan':
      return parseTagPlanYaml;
  }
}

describe('valid demo estate fixtures', () => {
  it('parses the inventory fixture', () => {
    const res = parseInventoryYaml(read(validUrl('demo.inventory.yaml')));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.metadata.slug).toBe('demo');
      expect(res.data.spec.resources).toHaveLength(5);
      // Sorted ascending by id.
      const ids = res.data.spec.resources.map((r) => r.id);
      expect([...ids].sort()).toEqual(ids);
      const withTags = res.data.spec.resources.find((r) => r.tags !== undefined);
      expect(must(withTags).tags).toEqual({ 'fs-product': 'atrium', 'fs-team': 'platform' });
    }
  });

  it('parses the spend fixture, including the unresolved row', () => {
    const res = parseSpendYaml(read(validUrl('demo.spend.yaml')));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.spec.rows).toHaveLength(6);
      const unresolved = res.data.spec.rows.filter((r) => r.unresolved === true);
      expect(unresolved).toHaveLength(1);
      expect(must(unresolved[0]).resourceId).toBeUndefined();
      expect(must(unresolved[0]).sourceLabel).toBeTruthy();
    }
  });

  it('parses the attribution fixture, exercising every match field and effect kind', () => {
    const res = parseAttributionYaml(read(validUrl('demo.attribution.yaml')));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.spec.dimensions.map((d) => d.id)).toEqual(['product', 'team']);
      expect(res.data.spec.rules).toHaveLength(8);
      const byId = (id: string) => must(res.data.spec.rules.find((r) => r.id === id));
      expect(byId('r1').match.resourceGroup).toBe('rg-platform');
      expect(byId('r3').match.subscription).toBeDefined();
      expect(byId('r4').match.nameGlob).toBe('vm-api-*');
      expect(byId('r5').match.resourceType).toBe('Microsoft.Web/sites');
      expect(byId('r6').match.tagExists).toBe('fs-product');
      expect(byId('r7').match.tagEquals).toEqual({ name: 'fs-team', value: 'platform' });
      expect(byId('r8').match).toEqual({});
      expect(byId('r6').fromTag).toEqual({ product: 'fs-product' });
      expect(byId('r8').split).toEqual({ product: { shared: 0.6, atrium: 0.4 } });
      expect(res.data.spec.overrides).toHaveLength(1);
    }
  });

  it('parses the tag plan fixture, exercising every action and a split-serialized value', () => {
    const res = parseTagPlanYaml(read(validUrl('demo.tagplan.yaml')));
    expect(res.ok).toBe(true);
    if (res.ok) {
      const actions = new Set(res.data.spec.entries.map((e) => e.action));
      expect(actions).toEqual(new Set(['add', 'change', 'remove', 'noop']));
      const splitValue = res.data.spec.entries.find((e) => e.desired?.includes('|'));
      expect(must(splitValue).desired).toBe('workspec:60|shared:40');
    }
  });
});

describe('round-trip: parse → serialize is byte-identical to the committed fixture', () => {
  it('inventory', () => {
    const text = read(validUrl('demo.inventory.yaml'));
    const res = parseInventoryYaml(text);
    expect(res.ok).toBe(true);
    if (res.ok) expect(serializeInventoryYaml(res.data)).toBe(text);
  });

  it('spend', () => {
    const text = read(validUrl('demo.spend.yaml'));
    const res = parseSpendYaml(text);
    expect(res.ok).toBe(true);
    if (res.ok) expect(serializeSpendYaml(res.data)).toBe(text);
  });

  it('attribution', () => {
    const text = read(validUrl('demo.attribution.yaml'));
    const res = parseAttributionYaml(text);
    expect(res.ok).toBe(true);
    if (res.ok) expect(serializeAttributionYaml(res.data)).toBe(text);
  });

  it('tagplan', () => {
    const text = read(validUrl('demo.tagplan.yaml'));
    const res = parseTagPlanYaml(text);
    expect(res.ok).toBe(true);
    if (res.ok) expect(serializeTagPlanYaml(res.data)).toBe(text);
  });
});

describe('invalid fixture battery', () => {
  for (const c of invalidCases) {
    it(`${c.file} fails at ${c.path} (line ${c.line}): ${c.reason}`, () => {
      const text = read(invalidUrl(c.file));
      const res = parseFor(c.kind)(text);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        const match = must(res.errors.find((e) => e.path === c.path));
        expect(match.line).toBe(c.line);
        expect(match.col).toBeGreaterThan(0);
      }
    });
  }
});

describe('YAML syntax errors', () => {
  it('reports a document-level error with a line, not a throw', () => {
    // Bad indentation / structure that the YAML parser itself rejects.
    const res = parseInventoryYaml('kind: Inventory\n  bad: : :\n');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.length).toBeGreaterThan(0);
      expect(must(res.errors[0]).line).toBeGreaterThan(0);
    }
  });
});
