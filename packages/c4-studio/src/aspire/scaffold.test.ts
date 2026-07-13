import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { createMemorySource, loadC4Model } from '@workspec/c4-model';
import { parseAspireGraph } from './graph-schema.js';
import { scaffoldAspireGraph } from './scaffold.js';
import type { AspireGraph } from './graph-schema.js';

const fixturePath = (rel: string): string =>
  fileURLToPath(new URL(`../../test/fixtures/aspire/${rel}`, import.meta.url));

async function loadSampleGraph(): Promise<AspireGraph> {
  const text = await readFile(fixturePath('sample-graph.json'), 'utf8');
  const result = parseAspireGraph(text);
  if (!result.ok) throw new Error(`fixture graph failed to parse: ${result.message}`);
  return result.data;
}

describe('scaffoldAspireGraph', () => {
  it('creates every mapped element, the system singleton, and the diagram; the tree validates with zero diagnostics', async () => {
    const graph = await loadSampleGraph();
    const source = createMemorySource();

    const report = await scaffoldAspireGraph(source, graph);

    // 7 resources: 1 parameter skipped, 6 mapped.
    expect(report.skippedParameters).toEqual(['environment-name']);
    const created = report.files.filter((f) => f.action === 'created');
    // 6 elements + 1 system + 1 diagram.
    expect(created).toHaveLength(8);

    const model = await loadC4Model(source);
    expect(model.diagnostics).toEqual([]);

    const elementCount = Object.values(model.elements).reduce((sum, byKind) => sum + byKind.size, 0);
    expect(elementCount).toBe(7); // 6 mapped resources + the system singleton
    expect(model.diagrams).toHaveLength(1);
    expect(model.diagrams[0]?.slug).toBe('aspire-container');
  });

  it('tags every generated element aspire-managed', async () => {
    const graph = await loadSampleGraph();
    const source = createMemorySource();
    await scaffoldAspireGraph(source, graph);

    const text = await source.readFile('.workspec/containers/api-server.yaml');
    expect(text).toContain('aspire-managed');
  });

  it('synthesizes a "contains" edge in the generated diagram from a parent link alone (empty references)', async () => {
    // The fixture's ledger-db carries parent: postgres-enterprise and an
    // EMPTY references array — exactly what the producer emits for a
    // server/child-db pair. The containment edge must come from synthesis.
    const graph = await loadSampleGraph();
    const source = createMemorySource();
    await scaffoldAspireGraph(source, graph);

    const diagram = parseYaml(await source.readFile('.workspec/diagrams/aspire-container.yaml')) as {
      edges: { from: string; to: string; label?: string }[];
    };
    expect(diagram.edges).toContainEqual({
      from: 'postgres-enterprise',
      to: 'ledger-db',
      label: 'contains',
    });
  });

  it('produces byte-identical output regardless of the producer resource array order', async () => {
    const text = await readFile(fixturePath('sample-graph.json'), 'utf8');
    const shuffledDoc = JSON.parse(text) as { resources: unknown[] };
    shuffledDoc.resources.reverse();
    const shuffled = parseAspireGraph(JSON.stringify(shuffledDoc));
    if (!shuffled.ok) throw new Error(`shuffled fixture failed to parse: ${shuffled.message}`);

    const originalSource = createMemorySource();
    const shuffledSource = createMemorySource();
    const originalReport = await scaffoldAspireGraph(originalSource, await loadSampleGraph());
    const shuffledReport = await scaffoldAspireGraph(shuffledSource, shuffled.data);

    const originalPaths = originalReport.files.map((f) => f.path).sort();
    expect(shuffledReport.files.map((f) => f.path).sort()).toEqual(originalPaths);
    for (const path of originalPaths) {
      expect(await shuffledSource.readFile(path)).toBe(await originalSource.readFile(path));
    }
  });

  it('is idempotent: scaffolding the same graph twice changes nothing on the second run', async () => {
    const graph = await loadSampleGraph();
    const source = createMemorySource();

    const first = await scaffoldAspireGraph(source, graph);
    expect(first.files.some((f) => f.action !== 'unchanged')).toBe(true);

    const second = await scaffoldAspireGraph(source, graph);
    expect(second.files.every((f) => f.action === 'unchanged')).toBe(true);
  });

  it('creates the system singleton from the apphost name only when the tree has none', async () => {
    const graph = await loadSampleGraph();
    const source = createMemorySource({
      '.workspec/system/existing.yaml':
        '# yaml-language-server: $schema=x\ntitle: Existing System\ndescription: Hand-authored.\n',
    });

    const report = await scaffoldAspireGraph(source, graph);
    expect(report.files.some((f) => f.path.startsWith('.workspec/system/'))).toBe(false);
    const existingText = await source.readFile('.workspec/system/existing.yaml');
    expect(existingText).toContain('Hand-authored.');
  });

  it('never overwrites a hand-authored file occupying an element path, reporting skipped-conflict', async () => {
    const graph = await loadSampleGraph();
    const source = createMemorySource({
      '.workspec/containers/api-server.yaml':
        '# yaml-language-server: $schema=x\ntype: container\ntitle: Hand Authored\ndescription: Written by a human.\n',
    });

    const report = await scaffoldAspireGraph(source, graph);
    const apiServerResult = report.files.find((f) => f.path === '.workspec/containers/api-server.yaml');
    expect(apiServerResult?.action).toBe('skipped-conflict');

    const text = await source.readFile('.workspec/containers/api-server.yaml');
    expect(text).toContain('Written by a human.');
  });

  it('never overwrites a hand-authored diagram occupying the reserved aspire-container slug', async () => {
    // No schema-directive first line — this diagram is not machine-generated.
    const handAuthored =
      'title: My Own Diagram\ntype: c4-container\ndescription: Hand-drawn topology.\nnodes: []\nedges: []\n';
    const graph = await loadSampleGraph();
    const source = createMemorySource({
      '.workspec/diagrams/aspire-container.yaml': handAuthored,
    });

    const report = await scaffoldAspireGraph(source, graph);
    const diagramResult = report.files.find(
      (f) => f.path === '.workspec/diagrams/aspire-container.yaml',
    );
    expect(diagramResult?.action).toBe('skipped-conflict');
    expect(await source.readFile('.workspec/diagrams/aspire-container.yaml')).toBe(handAuthored);
  });

  it('updates an aspire-managed element in place when its desired content changes', async () => {
    const source = createMemorySource();
    const apiResource: AspireGraph['resources'][number] = {
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
    const smallGraph: AspireGraph = {
      version: 'workspec-graph/v1',
      apphost: { name: 'App' },
      resources: [apiResource],
    };
    await scaffoldAspireGraph(source, smallGraph);

    const renamed: AspireGraph = {
      ...smallGraph,
      resources: [{ ...apiResource, typeName: 'ProjectResourceRenamed' }],
    };
    const report = await scaffoldAspireGraph(source, renamed);
    const apiResult = report.files.find((f) => f.path === '.workspec/containers/api.yaml');
    expect(apiResult?.action).toBe('updated');
  });

  it('never deletes an aspire-managed element whose resource disappeared from the graph', async () => {
    const source = createMemorySource();
    const apiResource: AspireGraph['resources'][number] = {
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
    const workerResource: AspireGraph['resources'][number] = {
      name: 'worker',
      kind: 'executable',
      typeName: 'ExecutableResource',
      image: null,
      command: null,
      workingDirectory: null,
      endpoints: [],
      parent: null,
      references: [],
      properties: {},
    };
    const withTwo: AspireGraph = {
      version: 'workspec-graph/v1',
      apphost: { name: 'App' },
      resources: [apiResource, workerResource],
    };
    await scaffoldAspireGraph(source, withTwo);
    expect(await source.exists('.workspec/containers/worker.yaml')).toBe(true);

    const withOne: AspireGraph = { ...withTwo, resources: [apiResource] };
    await scaffoldAspireGraph(source, withOne);
    expect(await source.exists('.workspec/containers/worker.yaml')).toBe(true);
  });
});
