import { describe, expect, it } from 'vitest';
import { createMemorySource } from '@workspec/c4-model';
import { checkAspireGraph } from './check.js';
import { scaffoldAspireGraph } from './scaffold.js';
import type { AspireGraph } from './graph-schema.js';

function graphWith(resources: AspireGraph['resources'], apphostName = 'App'): AspireGraph {
  return { version: 'workspec-graph/v1', apphost: { name: apphostName }, resources };
}

const API_RESOURCE: AspireGraph['resources'][number] = {
  name: 'api',
  kind: 'project',
  typeName: 'ProjectResource',
  image: null,
  command: null,
  workingDirectory: null,
  endpoints: [],
  parent: null,
  references: [],
  properties: {},
};

const DB_RESOURCE: AspireGraph['resources'][number] = {
  name: 'db',
  kind: 'container',
  typeName: 'PostgresServerResource',
  image: null,
  command: null,
  workingDirectory: null,
  endpoints: [],
  parent: null,
  references: [],
  properties: {},
};

describe('checkAspireGraph', () => {
  it('reports zero diagnostics against a tree just scaffolded from the same graph', async () => {
    const graph = graphWith([API_RESOURCE, DB_RESOURCE]);
    const source = createMemorySource();
    await scaffoldAspireGraph(source, graph);

    expect(await checkAspireGraph(source, graph)).toEqual([]);
  });

  it('reports element-missing for a mapped resource with no file on disk', async () => {
    const graph = graphWith([API_RESOURCE]);
    const source = createMemorySource();

    const diagnostics = await checkAspireGraph(source, graph);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'element-missing', slug: 'api' }),
    );
  });

  it('reports element-orphaned for an aspire-managed file whose resource left the graph', async () => {
    const graph = graphWith([API_RESOURCE, DB_RESOURCE]);
    const source = createMemorySource();
    await scaffoldAspireGraph(source, graph);

    const shrunk = graphWith([API_RESOURCE]);
    const diagnostics = await checkAspireGraph(source, shrunk);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ severity: 'warning', code: 'element-orphaned', slug: 'db' }),
    );
  });

  it('never flags a hand-authored element without the aspire-managed tag', async () => {
    const graph = graphWith([API_RESOURCE]);
    const source = createMemorySource({
      '.workspec/containers/hand-authored.yaml':
        '# yaml-language-server: $schema=x\ntype: container\ntitle: Hand Authored\ndescription: A human wrote this.\n',
    });
    await scaffoldAspireGraph(source, graph);

    const diagnostics = await checkAspireGraph(source, graph);
    expect(diagnostics.some((d) => d.slug === 'hand-authored')).toBe(false);
  });

  it('reports field-drift when a governed element field was hand-edited', async () => {
    const graph = graphWith([API_RESOURCE]);
    const source = createMemorySource();
    await scaffoldAspireGraph(source, graph);

    const original = await source.readFile('.workspec/containers/api.yaml');
    await source.writeFile('.workspec/containers/api.yaml', original.replace('title: api', 'title: API'));

    const diagnostics = await checkAspireGraph(source, graph);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ severity: 'warning', code: 'field-drift', slug: 'api' }),
    );
  });

  it('reports edge-missing for a resolvable reference absent from the on-disk diagram', async () => {
    const withRef = graphWith([
      { ...API_RESOURCE, references: [{ target: 'db', via: 'connection-string', label: null }] },
      DB_RESOURCE,
    ]);
    const source = createMemorySource();
    await scaffoldAspireGraph(source, graphWith([API_RESOURCE, DB_RESOURCE])); // scaffold WITHOUT the reference

    const diagnostics = await checkAspireGraph(source, withRef);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'edge-missing' }),
    );
  });

  it('reports edge-missing when a synthesized contains edge is absent from the on-disk diagram', async () => {
    const child: AspireGraph['resources'][number] = {
      ...DB_RESOURCE,
      name: 'ledger',
      typeName: 'PostgresDatabaseResource',
      parent: 'db',
    };
    const source = createMemorySource();
    // Scaffold WITHOUT the parent link, so no contains edge is on disk.
    await scaffoldAspireGraph(source, graphWith([{ ...child, parent: null }, DB_RESOURCE]));

    const diagnostics = await checkAspireGraph(source, graphWith([child, DB_RESOURCE]));
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        code: 'edge-missing',
        message: expect.stringContaining('"contains"') as string,
      }),
    );
  });

  it('treats a hand-authored diagram at the reserved slug as unmanaged, never drift-checking it', async () => {
    const withRef = graphWith([
      { ...API_RESOURCE, references: [{ target: 'db', via: 'connection-string', label: null }] },
      DB_RESOURCE,
    ]);
    const source = createMemorySource({
      // No schema-directive first line — not machine-generated.
      '.workspec/diagrams/aspire-container.yaml':
        'title: My Own Diagram\ntype: c4-container\ndescription: Hand-drawn.\nnodes: []\nedges:\n  - from: x\n    to: y\n',
    });
    await scaffoldAspireGraph(source, withRef); // elements land; the diagram stays hand-authored

    const diagnostics = await checkAspireGraph(source, withRef);
    expect(diagnostics.filter((d) => d.file === '.workspec/diagrams/aspire-container.yaml')).toEqual(
      [],
    );
  });

  it('reports edge-orphaned for a diagram edge no longer reflected by any reference', async () => {
    const withRef = graphWith([
      { ...API_RESOURCE, references: [{ target: 'db', via: 'connection-string', label: null }] },
      DB_RESOURCE,
    ]);
    const source = createMemorySource();
    await scaffoldAspireGraph(source, withRef);

    const withoutRef = graphWith([API_RESOURCE, DB_RESOURCE]);
    const diagnostics = await checkAspireGraph(source, withoutRef);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ severity: 'warning', code: 'edge-orphaned' }),
    );
  });

  it('reports field-drift for an edge whose label changed', async () => {
    const labeled = graphWith([
      {
        ...API_RESOURCE,
        references: [{ target: 'db', via: 'connection-string', label: 'reads' }],
      },
      DB_RESOURCE,
    ]);
    const source = createMemorySource();
    await scaffoldAspireGraph(source, labeled);

    const relabeled = graphWith([
      {
        ...API_RESOURCE,
        references: [{ target: 'db', via: 'connection-string', label: 'reads/writes' }],
      },
      DB_RESOURCE,
    ]);
    const diagnostics = await checkAspireGraph(source, relabeled);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ severity: 'warning', code: 'field-drift', file: '.workspec/diagrams/aspire-container.yaml' }),
    );
  });
});
