import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseDiagramYaml } from '../../src/yaml/parse-diagram-yaml.js';
import { parseSpecYaml } from '../../src/yaml/parse-spec-yaml.js';
import { parseSystemYaml } from '../../src/yaml/parse-system-yaml.js';

const fixtureRoot = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/enterprise-subset/.workspec');

function read(relativePath: string): string {
  return readFileSync(join(fixtureRoot, relativePath), 'utf8');
}

/**
 * These four files are vendored verbatim from the FieldstateNZ/workspec
 * repo's own `.workspec/` tree (byte-identical — verified separately with
 * `diff` against the source repo, since that repo isn't a dependency of
 * this package or available in every environment this test runs in).
 * Zero validation errors here is the load-bearing conformance signal: our
 * schemas accept exactly what Enterprise's own tree produces.
 */
describe('enterprise-subset conformance', () => {
  it('spec.yaml validates against Spec with zero errors', () => {
    const result = parseSpecYaml(read('spec.yaml'));
    if (!result.ok) {
      throw new Error(result.errors.map((e) => `${e.path || '<root>'}: ${e.message}`).join('; '));
    }
    expect(result.ok).toBe(true);
  });

  it('system/workspec.yaml validates against SystemElement with zero errors', () => {
    const result = parseSystemYaml(read('system/workspec.yaml'));
    if (!result.ok) {
      throw new Error(result.errors.map((e) => `${e.path || '<root>'}: ${e.message}`).join('; '));
    }
    expect(result.ok).toBe(true);
  });

  it('diagrams/system-context.yaml validates against Diagram with zero errors', () => {
    const result = parseDiagramYaml(read('diagrams/system-context.yaml'));
    if (!result.ok) {
      throw new Error(result.errors.map((e) => `${e.path || '<root>'}: ${e.message}`).join('; '));
    }
    expect(result.ok).toBe(true);
  });

  it('diagrams/container.yaml validates against Diagram with zero errors', () => {
    const result = parseDiagramYaml(read('diagrams/container.yaml'));
    if (!result.ok) {
      throw new Error(result.errors.map((e) => `${e.path || '<root>'}: ${e.message}`).join('; '));
    }
    expect(result.ok).toBe(true);
  });
});
