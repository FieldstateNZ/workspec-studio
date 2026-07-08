import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseActorYaml } from '../../src/yaml/parse-actor-yaml.js';
import { parseContainerYaml } from '../../src/yaml/parse-container-yaml.js';
import { parseComponentYaml } from '../../src/yaml/parse-component-yaml.js';
import { parseDatabaseYaml } from '../../src/yaml/parse-database-yaml.js';
import { parseDiagramYaml } from '../../src/yaml/parse-diagram-yaml.js';
import { parseDomainYaml } from '../../src/yaml/parse-domain-yaml.js';
import { parseExternalSystemYaml } from '../../src/yaml/parse-external-system-yaml.js';
import { parseFeatureYaml } from '../../src/yaml/parse-feature-yaml.js';
import { parseLayoutYaml } from '../../src/yaml/parse-layout-yaml.js';
import { parseQueueYaml } from '../../src/yaml/parse-queue-yaml.js';
import { parseSpecYaml } from '../../src/yaml/parse-spec-yaml.js';
import { parseSystemYaml } from '../../src/yaml/parse-system-yaml.js';
import type { ParseResult } from '../../src/yaml/parse-result.types.js';

const fixtureRoot = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/representative/.workspec');

function read(relativePath: string): string {
  return readFileSync(join(fixtureRoot, relativePath), 'utf8');
}

/**
 * Every supported kind, exercised once: proves the representative fixture
 * tree parses cleanly end to end, including both thin diagram node
 * shapes, the `__system__` alias, edge label/category/lens, and a
 * `.layout/` file with pinned nodes, an edge hint, and a viewport.
 */
describe('representative fixture tree', () => {
  const cases: readonly [string, string, (text: string) => ParseResult<unknown>][] = [
    ['spec.yaml', 'spec', parseSpecYaml],
    ['system/main-system.yaml', 'system', parseSystemYaml],
    ['actors/architect.yaml', 'actor', parseActorYaml],
    ['external-systems/payment-gateway.yaml', 'external-system', parseExternalSystemYaml],
    ['domains/billing.yaml', 'domain', parseDomainYaml],
    ['features/invoice-export.yaml', 'feature', parseFeatureYaml],
    ['containers/api-server.yaml', 'container', parseContainerYaml],
    ['components/diagram-editor.yaml', 'component', parseComponentYaml],
    ['databases/primary-db.yaml', 'database', parseDatabaseYaml],
    ['queues/event-bus.yaml', 'queue', parseQueueYaml],
    ['diagrams/system-context.yaml', 'diagram (c4-context)', parseDiagramYaml],
    ['diagrams/container.yaml', 'diagram (c4-container)', parseDiagramYaml],
    ['diagrams/.layout/system-context.yaml', 'layout', parseLayoutYaml],
  ];

  it.each(cases)('%s validates as a %s with zero errors', (path, _kind, parse) => {
    const result = parse(read(path));
    if (!result.ok) {
      throw new Error(`${path}: ${result.errors.map((e) => `${e.path || '<root>'}: ${e.message}`).join('; ')}`);
    }
    expect(result.ok).toBe(true);
  });

  it('the system-context diagram mixes a bare-slug node with a typed-ref node', () => {
    const result = parseDiagramYaml(read('diagrams/system-context.yaml'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      const diagram = result.data as { nodes: unknown[] };
      expect(diagram.nodes).toContainEqual({ slug: 'architect' });
      expect(diagram.nodes).toContainEqual({ 'external-system': 'payment-gateway' });
    }
  });

  it('the system-context diagram uses the __system__ alias in an edge', () => {
    const result = parseDiagramYaml(read('diagrams/system-context.yaml'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      const diagram = result.data as { edges: { from: string; to: string }[] };
      expect(diagram.edges.some((edge) => edge.from === '__system__' || edge.to === '__system__')).toBe(true);
    }
  });

  it('the container diagram edges carry label, category, and lens', () => {
    const result = parseDiagramYaml(read('diagrams/container.yaml'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      const diagram = result.data as {
        edges: { label?: string; category?: string; lens?: string }[];
      };
      expect(diagram.edges.some((edge) => edge.label && edge.category && edge.lens)).toBe(true);
    }
  });

  it('the layout file pins some nodes and leaves others to auto-layout', () => {
    const result = parseLayoutYaml(read('diagrams/.layout/system-context.yaml'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.data.nodes)).toContain('architect');
      expect(Object.keys(result.data.nodes)).not.toContain('payment-gateway');
      expect(result.data.edges).toBeDefined();
      expect(result.data.viewport).toBeDefined();
    }
  });
});
