// Tests for `createTopologyMcpProvider` over a temp fixture dir — the same
// mkdtemp-per-test style `fs-repository.test.ts` and `server.test.ts` use, so
// this suite never shares a live fixture directory with any other suite.
//
// Tools are exercised directly via `tool.handler(args)` rather than through a
// full MCP client/transport: `McpToolDef.handler` is a plain async function,
// and `@workspec/mcp-core`'s own `assemble-mcp-server.test.ts` already covers
// the protocol-boundary (wire-name dispatch, isError-on-throw) behaviour this
// provider is mounted through.

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { McpToolDef } from '@workspec/mcp-core';
import type { Environment, Resource, Topology } from '@workspec/topology-schema';
import { FsRepository } from './fs-repository.js';
import { createTopologyMcpProvider } from './mcp-provider.js';
import {
  fixtureAppServiceResource,
  fixtureEnvironment,
  fixtureTopology,
  seedFixtureCatalog,
  seedFixtureTree,
} from './test-fixtures.js';

/** Finds a tool by its module-local name (not the namespaced wire name). */
function tool(repo: FsRepository, name: string): McpToolDef {
  const provider = createTopologyMcpProvider(repo);
  const found = provider.tools.find((t) => t.name === name);
  if (found === undefined) throw new Error(`no such tool: ${name}`);
  return found;
}

/** Extracts the first text block from a `CallToolResult` (every tool here returns exactly one). */
function textOf(result: CallToolResult): string {
  const block = result.content[0];
  if (block === undefined || block.type !== 'text') {
    throw new Error(`expected a text content block, got: ${JSON.stringify(result.content)}`);
  }
  return block.text;
}

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'topology-mcp-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('list_topologies / read_topology / write_topology', () => {
  it('lists and reads a written topology', async () => {
    const repo = new FsRepository(dir);
    await repo.writeTopology('.workspec/topologies/web-app.yaml', fixtureTopology());

    const listResult = await tool(repo, 'list_topologies').handler({});
    expect(listResult.isError).not.toBe(true);
    const topologies = JSON.parse(textOf(listResult)) as { ref: string; slug: string }[];
    expect(topologies).toEqual(
      expect.arrayContaining([expect.objectContaining({ ref: '.workspec/topologies/web-app.yaml', slug: 'web-app' })]),
    );

    const readResult = await tool(repo, 'read_topology').handler({ ref: '.workspec/topologies/web-app.yaml' });
    expect(readResult.isError).not.toBe(true);
    const topology = JSON.parse(textOf(readResult)) as Topology;
    expect(topology.metadata.slug).toBe('web-app');
  });

  it('rejects an invalid topology write: isError with issues, and the file is untouched', async () => {
    const repo = new FsRepository(dir);
    await repo.writeTopology('.workspec/topologies/web-app.yaml', fixtureTopology());
    const before = await readFile(join(dir, '.workspec/topologies/web-app.yaml'), 'utf8');

    const valid = await repo.readTopology('.workspec/topologies/web-app.yaml');
    const invalid = structuredClone(valid) as unknown as Record<string, unknown>;
    (invalid.spec as Record<string, unknown>).defaultEnvironment = 'not-declared';

    const result = await tool(repo, 'write_topology').handler({
      ref: '.workspec/topologies/web-app.yaml',
      topology: invalid,
    });
    expect(result.isError).toBe(true);
    const body = JSON.parse(textOf(result)) as { issues: { path: string; message: string }[] };
    expect(body.issues.length).toBeGreaterThan(0);

    const after = await readFile(join(dir, '.workspec/topologies/web-app.yaml'), 'utf8');
    expect(after).toBe(before); // untouched
  });

  it('reports an isError (not a throw) for a ref that escapes the served root, creating no file', async () => {
    const repo = new FsRepository(dir);
    const result = await tool(repo, 'write_topology').handler({
      ref: '../outside.topology.yaml',
      topology: fixtureTopology(),
    });
    expect(result.isError).toBe(true);
    await expect(readFile(join(dir, '..', 'outside.topology.yaml'), 'utf8')).rejects.toBeTruthy();
  });

  it('rejects a backslash-traversal ref up front, creating no garbage file', async () => {
    const repo = new FsRepository(dir);
    const badRef = String.raw`..\..\x.topology.yaml`;
    const result = await tool(repo, 'write_topology').handler({ ref: badRef, topology: fixtureTopology() });
    expect(result.isError).toBe(true);
    await expect(readFile(join(dir, badRef), 'utf8')).rejects.toBeTruthy();
  });

  it('reports an isError (not a throw) for a missing ref', async () => {
    const repo = new FsRepository(dir);
    const result = await tool(repo, 'read_topology').handler({ ref: '.workspec/topologies/nope.yaml' });
    expect(result.isError).toBe(true);
  });
});

describe('list_resources / read_resource / write_resource', () => {
  it('lists and reads a written resource', async () => {
    const repo = new FsRepository(dir);
    await repo.writeResource('.workspec/resources/app-service.yaml', fixtureAppServiceResource());

    const listResult = await tool(repo, 'list_resources').handler({});
    expect(listResult.isError).not.toBe(true);
    expect(JSON.parse(textOf(listResult))).toEqual(
      expect.arrayContaining([expect.objectContaining({ ref: '.workspec/resources/app-service.yaml' })]),
    );

    const readResult = await tool(repo, 'read_resource').handler({ ref: '.workspec/resources/app-service.yaml' });
    expect(readResult.isError).not.toBe(true);
    const resource = JSON.parse(textOf(readResult)) as Resource;
    expect(resource.spec.cost?.sku).toBe('app-service-p1v3');
  });

  it('write_resource rejects an invalid resource without writing', async () => {
    const repo = new FsRepository(dir);
    const result = await tool(repo, 'write_resource').handler({
      ref: '.workspec/resources/bad.yaml',
      resource: { apiVersion: 'workspec.io/v1alpha1', kind: 'Resource', metadata: {}, spec: { kind: 'not-a-kind' } },
    });
    expect(result.isError).toBe(true);
    await expect(readFile(join(dir, '.workspec/resources/bad.yaml'), 'utf8')).rejects.toBeTruthy();
  });
});

describe('list_environments / read_environment / write_environment', () => {
  it('lists and reads a written environment', async () => {
    const repo = new FsRepository(dir);
    await repo.writeEnvironment('.workspec/environments/prod.yaml', fixtureEnvironment());

    const listResult = await tool(repo, 'list_environments').handler({});
    expect(listResult.isError).not.toBe(true);
    expect(JSON.parse(textOf(listResult))).toEqual([{ ref: '.workspec/environments/prod.yaml', slug: 'prod' }]);

    const readResult = await tool(repo, 'read_environment').handler({ ref: '.workspec/environments/prod.yaml' });
    expect(readResult.isError).not.toBe(true);
    const environment = JSON.parse(textOf(readResult)) as Environment;
    expect(environment.spec.naming?.resourceGroupSuffix).toBe('-prod');
  });

  it('write_environment rejects an invalid environment without writing', async () => {
    const repo = new FsRepository(dir);
    const result = await tool(repo, 'write_environment').handler({
      ref: '.workspec/environments/bad.yaml',
      environment: { apiVersion: 'workspec.io/v1alpha1', kind: 'Environment', metadata: {}, spec: { overrides: 'nope' } },
    });
    expect(result.isError).toBe(true);
    await expect(readFile(join(dir, '.workspec/environments/bad.yaml'), 'utf8')).rejects.toBeTruthy();
  });
});

describe('validate', () => {
  it('reports zero diagnostics on the clean fixture tree (topology + resources + environment + catalog)', async () => {
    const repo = new FsRepository(dir);
    await seedFixtureTree(repo);
    await seedFixtureCatalog(dir);

    const result = await tool(repo, 'validate').handler({});
    expect(result.isError).not.toBe(true);
    expect(JSON.parse(textOf(result))).toEqual([]);
  });

  it('reports a dangling-environment-ref error when the topology declares an environment with no file', async () => {
    const repo = new FsRepository(dir);
    await repo.writeTopology('.workspec/topologies/web-app.yaml', fixtureTopology());
    // No environment file written — "prod" is declared but absent.

    const result = await tool(repo, 'validate').handler({});
    expect(result.isError).not.toBe(true);
    const diagnostics = JSON.parse(textOf(result)) as { severity: string; code: string }[];
    expect(diagnostics.some((d) => d.severity === 'error')).toBe(true);
  });
});

describe('resolve', () => {
  it('resolves the fixture topology for prod', async () => {
    const repo = new FsRepository(dir);
    await seedFixtureTree(repo);

    const result = await tool(repo, 'resolve').handler({ env: 'prod' });
    expect(result.isError).not.toBe(true);
    const resolved = JSON.parse(textOf(result)) as { envSlug: string; resources: { slug: string }[] };
    expect(resolved.envSlug).toBe('prod');
    expect(resolved.resources.map((r) => r.slug).sort()).toEqual(['app-service', 'client', 'rg-app', 'sql']);
  });

  it('reports an isError when the tree has no single topology', async () => {
    const repo = new FsRepository(dir);
    const result = await tool(repo, 'resolve').handler({ env: 'prod' });
    expect(result.isError).toBe(true);
  });

  it('rejects a path-shaped env up front, as an isError, not a throw', async () => {
    const repo = new FsRepository(dir);
    await seedFixtureTree(repo);

    const result = await tool(repo, 'resolve').handler({ env: '../../etc' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('not a valid slug');
  });
});

describe('reconcile', () => {
  it('reports every authored resource as phantom when nothing has been imported', async () => {
    const repo = new FsRepository(dir);
    await seedFixtureTree(repo);

    const result = await tool(repo, 'reconcile').handler({ env: 'prod' });
    expect(result.isError).not.toBe(true);
    const body = JSON.parse(textOf(result)) as {
      drifts: { class: string }[];
      summary: { hasDrift: boolean; countsByClass: Record<string, number> };
    };
    expect(body.summary.hasDrift).toBe(true);
    expect(body.summary.countsByClass.phantom).toBe(4);
  });

  it('matches every authored resource once its derived counterpart is imported (no phantom/orphan/divergent left)', async () => {
    // `@workspec/topology-adapters` never derives connections (see that
    // package's README) — a matched-but-connection-free actual tree still
    // reports `miswired` for the authored edges (spec §4 is correct here:
    // the connections genuinely aren't observed as present). This test
    // asserts the resource-matching side of reconcile specifically, not
    // zero total drift.
    const repo = new FsRepository(dir);
    await seedFixtureTree(repo);
    for (const slug of ['client', 'rg-app', 'app-service', 'sql']) {
      const authored = await repo.readResource(`.workspec/resources/${slug}.yaml`);
      await repo.writeResource(`.topology-actual/prod/${slug}.yaml`, {
        ...authored,
        spec: { ...authored.spec, source: { kind: 'derived', from: `terraform.${slug}` } },
      });
    }

    const result = await tool(repo, 'reconcile').handler({ env: 'prod' });
    expect(result.isError).not.toBe(true);
    const body = JSON.parse(textOf(result)) as {
      drifts: { class: string }[];
      summary: { countsByClass: Record<string, number> };
    };
    expect(body.summary.countsByClass.phantom).toBe(0);
    expect(body.summary.countsByClass.orphan).toBe(0);
    expect(body.summary.countsByClass.divergent).toBe(0);
    expect(body.drifts.every((d) => d.class === 'miswired')).toBe(true);
  });

  it('rejects a path-shaped env up front, as an isError, not a throw', async () => {
    const repo = new FsRepository(dir);
    await seedFixtureTree(repo);

    const result = await tool(repo, 'reconcile').handler({ env: '../../etc' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('not a valid slug');
  });

  it('returns isError with every offending ref when more than one observed topology file exists (BLOCKING review fix)', async () => {
    const repo = new FsRepository(dir);
    await seedFixtureTree(repo);
    const observed: Topology = {
      apiVersion: 'workspec.io/v1alpha1',
      kind: 'Topology',
      metadata: { slug: 'observed-a' },
      spec: {
        title: 'Observed A',
        provider: 'derived',
        environments: ['prod'],
        defaultEnvironment: 'prod',
        connections: [],
      },
    };
    await repo.writeTopology('.topology-actual/prod/observed-a.yaml', observed);
    await repo.writeTopology('.topology-actual/prod/observed-b.yaml', {
      ...observed,
      metadata: { slug: 'observed-b' },
    });

    const result = await tool(repo, 'reconcile').handler({ env: 'prod' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('multiple observed topology files');
    expect(textOf(result)).toContain('observed-a.yaml');
    expect(textOf(result)).toContain('observed-b.yaml');
  });
});

describe('cost', () => {
  it('computes cost against the seeded catalog', async () => {
    const repo = new FsRepository(dir);
    await seedFixtureTree(repo);
    await seedFixtureCatalog(dir);

    const result = await tool(repo, 'cost').handler({ env: 'prod' });
    expect(result.isError).not.toBe(true);
    const body = JSON.parse(textOf(result)) as { totals: { all: number } };
    expect(body.totals.all).toBe(150); // 100 (app-service) + 50 (sql), both payg/always/qty:1
  });

  it('reports an isError when the catalog is missing', async () => {
    const repo = new FsRepository(dir);
    await seedFixtureTree(repo);

    const result = await tool(repo, 'cost').handler({ env: 'prod' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('catalog not found');
  });

  it('rejects a path-shaped env up front, as an isError, not a throw', async () => {
    const repo = new FsRepository(dir);
    await seedFixtureTree(repo);
    await seedFixtureCatalog(dir);

    const result = await tool(repo, 'cost').handler({ env: '../../etc' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('not a valid slug');
  });
});

describe('import', () => {
  it('runs the terraform adapter over already-parsed vendor JSON, writing nothing', async () => {
    const repo = new FsRepository(dir);
    const input = {
      values: {
        root_module: {
          resources: [
            {
              address: 'azurerm_resource_group.app',
              type: 'azurerm_resource_group',
              name: 'app',
              values: { name: 'rg-app' },
            },
          ],
        },
      },
    };

    const result = await tool(repo, 'import').handler({ adapter: 'terraform', env: 'prod', input });
    expect(result.isError).not.toBe(true);
    const body = JSON.parse(textOf(result)) as { resources: { spec: { name: string } }[] };
    expect(body.resources).toHaveLength(1);
    expect(body.resources[0]?.spec.name).toBe('rg-app');
    expect(await repo.listResources()).toEqual([]); // nothing written
  });

  it('reports an isError for an unknown adapter', async () => {
    const repo = new FsRepository(dir);
    const result = await tool(repo, 'import').handler({ adapter: 'nope', env: 'prod', input: {} });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('unknown adapter');
  });

  it('rejects a path-shaped env up front, as an isError, not a throw', async () => {
    const repo = new FsRepository(dir);
    const result = await tool(repo, 'import').handler({ adapter: 'terraform', env: '../../etc', input: {} });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('not a valid slug');
  });
});
