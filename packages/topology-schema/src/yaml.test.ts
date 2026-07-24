import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseEnvironmentYaml, parseResourceYaml, parseTopologyYaml } from './index.js';
import { invalidCases } from './invalid-fixtures.expected.js';

// src/ → topology-schema/ → test/fixtures/valid
const validUrl = (file: string): string =>
  fileURLToPath(new URL(`../test/fixtures/valid/${file}`, import.meta.url));
// src/ → topology-schema/ → test/fixtures/invalid
const invalidUrl = (file: string): string =>
  fileURLToPath(new URL(`../test/fixtures/invalid/${file}`, import.meta.url));

const read = (path: string): string => readFileSync(path, 'utf8');

/** Narrows a possibly-undefined lookup/index result, failing the test loudly if absent. */
function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected value to be defined');
  return value;
}

// The "web-app" reference fixture set from the spec: a topology plus the
// resources and environments it references. These live under this
// package's own `test/fixtures/valid/` so the package's own test suite
// always exercises the current schema.
describe('valid web-app reference fixtures', () => {
  it('parses the topology fixture with its full connection graph', () => {
    const res = parseTopologyYaml(read(validUrl('web-app.topology.yaml')));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.metadata.slug).toBe('web-app');
      expect(res.data.spec.defaultEnvironment).toBe('prod');
      expect(res.data.spec.environments).toEqual(['dev', 'test', 'prod']);
      expect(res.data.spec.connections).toHaveLength(9);
      const telemetryEdges = res.data.spec.connections.filter((c) => c.class === 'telemetry');
      expect(telemetryEdges.map((c) => c.to)).toEqual(['app-insights', 'app-insights']);
      const devTestRewire = res.data.spec.connections.find(
        (c) => c.from === 'client' && c.to === 'app-service',
      );
      expect(must(devTestRewire).environments).toEqual(['dev', 'test']);
    }
  });

  it('parses each resource fixture in the web-app set', () => {
    const slugs = [
      'client',
      'app-service',
      'write-fn',
      'cache',
      'redis-pe',
      'sql',
      'front-door',
      'app-insights',
      'core-vnet',
      'snet-workload',
      'rg-app',
    ];
    for (const slug of slugs) {
      const res = parseResourceYaml(read(validUrl(`${slug}.resource.yaml`)));
      expect(res.ok, `${slug} should parse`).toBe(true);
    }
  });

  it('front-door is scoped to prod only', () => {
    const res = parseResourceYaml(read(validUrl('front-door.resource.yaml')));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.spec.environments).toEqual(['prod']);
  });

  it('app-service has no explicit environments (present in all topology envs)', () => {
    const res = parseResourceYaml(read(validUrl('app-service.resource.yaml')));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.spec.environments).toBeUndefined();
  });

  it('vnet/subnet/resource-group resources carry no boundary flag, just their kind', () => {
    for (const [slug, kind] of [
      ['core-vnet', 'vnet'],
      ['snet-workload', 'subnet'],
      ['rg-app', 'resource-group'],
    ] as const) {
      const res = parseResourceYaml(read(validUrl(`${slug}.resource.yaml`)));
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.data.spec.kind).toBe(kind);
    }
  });

  it('parses dev/test/prod environments with prod overriding app-service and cache', () => {
    const prod = parseEnvironmentYaml(read(validUrl('prod.environment.yaml')));
    expect(prod.ok).toBe(true);
    if (prod.ok) {
      expect(prod.data.spec.naming?.resourceGroupSuffix).toBe('-prod');
      expect(prod.data.spec.overrides?.['app-service']?.cost?.qty).toBe(3);
      expect(prod.data.spec.overrides?.cache?.config?.sku).toBe('Standard');
    }

    for (const slug of ['dev', 'test']) {
      const res = parseEnvironmentYaml(read(validUrl(`${slug}.environment.yaml`)));
      expect(res.ok, `${slug} should parse`).toBe(true);
    }
  });
});

describe('invalid fixture battery', () => {
  for (const c of invalidCases) {
    it(`${c.file} fails at ${c.path} (line ${c.line})`, () => {
      const text = read(invalidUrl(c.file));
      const parse =
        c.kind === 'topology'
          ? parseTopologyYaml
          : c.kind === 'resource'
            ? parseResourceYaml
            : parseEnvironmentYaml;
      const res = parse(text);
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
    const res = parseTopologyYaml('kind: Topology\n  bad: : :\n');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.length).toBeGreaterThan(0);
      expect(must(res.errors[0]).line).toBeGreaterThan(0);
    }
  });
});
