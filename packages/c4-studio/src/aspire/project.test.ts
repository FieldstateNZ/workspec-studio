import { describe, expect, it } from 'vitest';
import { orderedNodesFor, projectAspireGraph } from './project.js';
import type { AspireGraph, AspireResource } from './graph-schema.js';

function resource(overrides: Partial<AspireResource>): AspireResource {
  return {
    name: 'r',
    kind: 'container',
    typeName: 'SomeResource',
    image: null,
    command: null,
    workingDirectory: null,
    endpoints: [],
    parent: null,
    references: [],
    properties: {},
    ...overrides,
  };
}

function graph(resources: AspireResource[], apphostName = 'My App'): AspireGraph {
  return { version: 'workspec-graph/v1', apphost: { name: apphostName }, resources };
}

describe('projectAspireGraph', () => {
  it('maps container/executable/project to containers/, tagging every element aspire-managed', () => {
    const { elements } = projectAspireGraph(
      graph([
        resource({ name: 'api', kind: 'project', typeName: 'ProjectResource' }),
        resource({ name: 'worker', kind: 'executable', typeName: 'ExecutableResource', command: 'pnpm' }),
        resource({ name: 'cache-host', kind: 'container', typeName: 'ContainerResource', image: 'redis:7' }),
      ]),
    );
    // Elements come out in resource-name (ordinal) order, not producer array order.
    expect(elements.map((e) => ({ slug: e.slug, kind: e.kind }))).toEqual([
      { slug: 'api', kind: 'container' },
      { slug: 'cache-host', kind: 'container' },
      { slug: 'worker', kind: 'container' },
    ]);
    expect(elements[1]?.technology).toBe('redis:7');
    expect(elements[2]?.technology).toBe('pnpm');
    expect(elements.every((e) => e.description.includes('Imported from the Aspire apphost graph'))).toBe(
      true,
    );
  });

  it('prefers image over command for the technology hint when both are present', () => {
    const { elements } = projectAspireGraph(
      graph([resource({ name: 'api', kind: 'container', image: 'node:20', command: 'node' })]),
    );
    expect(elements[0]?.technology).toBe('node:20');
  });

  it('classifies by typeName into databases/ and queues/, overriding kind', () => {
    const { elements } = projectAspireGraph(
      graph([
        resource({ name: 'db', kind: 'container', typeName: 'PostgresServerResource' }),
        resource({ name: 'bus', kind: 'azure', typeName: 'AzureServiceBusResource' }),
      ]),
    );
    expect(elements.find((e) => e.slug === 'db')?.kind).toBe('database');
    expect(elements.find((e) => e.slug === 'bus')?.kind).toBe('queue');
  });

  it('maps kind: azure (not classified) to external-system, with no technology field', () => {
    const { elements } = projectAspireGraph(
      graph([resource({ name: 'storage', kind: 'azure', typeName: 'AzureStorageResource', image: 'x' })]),
    );
    expect(elements[0]?.kind).toBe('external-system');
    expect(elements[0]?.technology).toBeUndefined();
  });

  it('skips kind: parameter resources entirely, reporting them separately', () => {
    const { elements, skippedParameters } = projectAspireGraph(
      graph([resource({ name: 'env-name', kind: 'parameter', typeName: 'ParameterResource' })]),
    );
    expect(elements).toHaveLength(0);
    expect(skippedParameters).toEqual(['env-name']);
  });

  it('notes the parent relationship in the description when the parent is itself mapped', () => {
    const { elements } = projectAspireGraph(
      graph([
        resource({ name: 'pg', kind: 'container', typeName: 'PostgresServerResource' }),
        resource({ name: 'db', kind: 'container', typeName: 'PostgresDatabaseResource', parent: 'pg' }),
      ]),
    );
    const db = elements.find((e) => e.slug === 'db');
    expect(db?.description).toContain('Child of Aspire resource "pg"');
  });

  it('does not note a parent that was itself skipped (a parameter)', () => {
    const { elements } = projectAspireGraph(
      graph([
        resource({ name: 'p', kind: 'parameter', typeName: 'ParameterResource' }),
        resource({ name: 'api', kind: 'project', typeName: 'ProjectResource', parent: 'p' }),
      ]),
    );
    expect(elements[0]?.description).not.toContain('Child of');
  });

  describe('slug sanitization + collisions', () => {
    it('slugifies resource names to the schema slug charset', () => {
      const { elements } = projectAspireGraph(
        graph([resource({ name: 'API Server!!', kind: 'project', typeName: 'ProjectResource' })]),
      );
      expect(elements[0]?.slug).toBe('api-server');
    });

    it('assigns a deterministic -2, -3 suffix when two names sanitize to the same slug', () => {
      const { elements } = projectAspireGraph(
        graph([
          resource({ name: 'API Server', kind: 'project', typeName: 'ProjectResource' }),
          resource({ name: 'api-server', kind: 'project', typeName: 'ProjectResource' }),
          resource({ name: 'api_server', kind: 'project', typeName: 'ProjectResource' }),
        ]),
      );
      expect(elements.map((e) => e.slug)).toEqual(['api-server', 'api-server-2', 'api-server-3']);
    });
  });

  describe('edges', () => {
    it('resolves a reference between two mapped resources, labeling from `label` when given', () => {
      const { edges } = projectAspireGraph(
        graph([
          resource({
            name: 'api',
            kind: 'project',
            typeName: 'ProjectResource',
            references: [{ target: 'db', via: 'connection-string', label: 'reads/writes' }],
          }),
          resource({ name: 'db', kind: 'container', typeName: 'PostgresServerResource' }),
        ]),
      );
      expect(edges).toEqual([{ from: 'api', to: 'db', label: 'reads/writes' }]);
    });

    it('falls back to a via-derived label when no label is authored', () => {
      const { edges } = projectAspireGraph(
        graph([
          resource({
            name: 'api',
            kind: 'project',
            typeName: 'ProjectResource',
            references: [{ target: 'bus', via: 'wait', label: null }],
          }),
          resource({ name: 'bus', kind: 'container', typeName: 'RabbitMQServerResource' }),
        ]),
      );
      expect(edges).toEqual([{ from: 'api', to: 'bus', label: 'waits for' }]);
    });

    it('omits the label entirely for via: unknown with no authored label', () => {
      const { edges } = projectAspireGraph(
        graph([
          resource({
            name: 'api',
            kind: 'project',
            typeName: 'ProjectResource',
            references: [{ target: 'db', via: 'unknown', label: null }],
          }),
          resource({ name: 'db', kind: 'container', typeName: 'PostgresServerResource' }),
        ]),
      );
      expect(edges).toEqual([{ from: 'api', to: 'db' }]);
      expect(edges[0]).not.toHaveProperty('label');
    });

    it('drops an edge whose target is a skipped parameter', () => {
      const { edges } = projectAspireGraph(
        graph([
          resource({
            name: 'api',
            kind: 'project',
            typeName: 'ProjectResource',
            references: [{ target: 'env-name', via: 'environment', label: null }],
          }),
          resource({ name: 'env-name', kind: 'parameter', typeName: 'ParameterResource' }),
        ]),
      );
      expect(edges).toEqual([]);
    });

    it('drops an edge whose target does not exist in the graph at all', () => {
      const { edges } = projectAspireGraph(
        graph([
          resource({
            name: 'api',
            kind: 'project',
            typeName: 'ProjectResource',
            references: [{ target: 'ghost', via: 'endpoint', label: null }],
          }),
        ]),
      );
      expect(edges).toEqual([]);
    });

    it('drops a self-referencing edge', () => {
      const { edges } = projectAspireGraph(
        graph([
          resource({
            name: 'api',
            kind: 'project',
            typeName: 'ProjectResource',
            references: [{ target: 'api', via: 'relationship', label: null }],
          }),
        ]),
      );
      expect(edges).toEqual([]);
    });

    it('synthesizes a "contains" edge from parent to child when the parent is mapped and references are empty', () => {
      // The producer captures containment ONLY in `parent` — `references`
      // stays empty for a plain server/child-db pair.
      const { edges } = projectAspireGraph(
        graph([
          resource({ name: 'pg', kind: 'container', typeName: 'PostgresServerResource' }),
          resource({
            name: 'ledger',
            kind: 'container',
            typeName: 'PostgresDatabaseResource',
            parent: 'pg',
          }),
        ]),
      );
      expect(edges).toEqual([{ from: 'pg', to: 'ledger', label: 'contains' }]);
    });

    it('does not synthesize a contains edge when the parent is skipped or absent from the graph', () => {
      const { edges } = projectAspireGraph(
        graph([
          resource({ name: 'p', kind: 'parameter', typeName: 'ParameterResource' }),
          resource({ name: 'api', kind: 'project', typeName: 'ProjectResource', parent: 'p' }),
          resource({ name: 'worker', kind: 'project', typeName: 'ProjectResource', parent: 'ghost' }),
        ]),
      );
      expect(edges).toEqual([]);
    });

    it('dedupes an identical (from, to, label) triple', () => {
      const { edges } = projectAspireGraph(
        graph([
          resource({
            name: 'api',
            kind: 'project',
            typeName: 'ProjectResource',
            references: [
              { target: 'db', via: 'connection-string', label: 'x' },
              { target: 'db', via: 'connection-string', label: 'x' },
            ],
          }),
          resource({ name: 'db', kind: 'container', typeName: 'PostgresServerResource' }),
        ]),
      );
      expect(edges).toHaveLength(1);
    });
  });

  it('derives the system singleton from the apphost name', () => {
    const { system } = projectAspireGraph(graph([], 'Ledger AppHost'));
    expect(system.slug).toBe('ledger-apphost');
    expect(system.title).toBe('Ledger AppHost');
  });
});

describe('orderedNodesFor', () => {
  it('groups elements by kind (container, database, queue, external-system), preserving resource-name order within each group', () => {
    const { elements } = projectAspireGraph(
      graph([
        resource({ name: 'ext', kind: 'azure', typeName: 'AzureStorageResource' }),
        resource({ name: 'q', kind: 'container', typeName: 'KafkaResource' }),
        resource({ name: 'c1', kind: 'project', typeName: 'ProjectResource' }),
        resource({ name: 'db', kind: 'container', typeName: 'PostgresServerResource' }),
        resource({ name: 'c2', kind: 'project', typeName: 'ProjectResource' }),
      ]),
    );
    expect(orderedNodesFor(elements).map((e) => e.slug)).toEqual(['c1', 'c2', 'db', 'q', 'ext']);
  });
});
