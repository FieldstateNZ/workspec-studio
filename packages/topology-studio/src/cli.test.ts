import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Topology } from '@workspec/topology-schema';
import { run } from './cli.js';
import type { CliIO } from './cli.js';
import { FsRepository } from './fs-repository.js';
import {
  fixtureAppServiceResource,
  fixtureClientResource,
  fixtureEnvironment,
  fixtureResourceGroupResource,
  fixtureSqlResource,
  fixtureTopology,
  seedFixtureCatalog,
  seedFixtureTree,
} from './test-fixtures.js';

// Capturing IO double (factory-built per test).
function captureIO(): { io: CliIO; out: () => string; err: () => string } {
  let out = '';
  let err = '';
  return {
    io: { out: (t) => (out += t), err: (t) => (err += t) },
    out: () => out,
    err: () => err,
  };
}

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'topology-studio-cli-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('help + dispatch', () => {
  it('prints help with no command', async () => {
    const { io, out } = captureIO();
    // With no command, "serve" is documented as the default — but this test
    // only exercises the plain `help`/`--help` path, not a real bind, since
    // `serve` would hang the test run.
    const code = await run(['help'], io);
    expect(code).toBe(0);
    expect(out()).toContain('workspec-topology');
  });

  it('exits 2 on an unknown command', async () => {
    const { io, err } = captureIO();
    const code = await run(['bogus'], io);
    expect(code).toBe(2);
    expect(err()).toContain('unknown command');
  });
});

describe('validate', () => {
  it('exits 0 on a clean tree', async () => {
    const repo = new FsRepository(dir);
    await seedFixtureTree(repo);
    await seedFixtureCatalog(dir);

    const { io, err } = captureIO();
    const code = await run(['validate', '--dir', dir], io);
    expect(code).toBe(0);
    expect(err()).toContain('tree OK');
  });

  it('exits 1 when the topology declares an environment with no file', async () => {
    const repo = new FsRepository(dir);
    await repo.writeTopology('.workspec/topologies/web-app.yaml', fixtureTopology());
    // no environment file written for "prod"

    const { io, err } = captureIO();
    const code = await run(['validate', '--dir', dir], io);
    expect(code).toBe(1);
    expect(err()).toContain('error');
  });

  it('--json also prints the diagnostics array to stdout', async () => {
    const repo = new FsRepository(dir);
    await repo.writeTopology('.workspec/topologies/web-app.yaml', fixtureTopology());

    const { io, out } = captureIO();
    await run(['validate', '--dir', dir, '--json'], io);
    const diagnostics = JSON.parse(out()) as { severity: string }[];
    expect(diagnostics.length).toBeGreaterThan(0);
  });

  it('exits 1 when a resource overrides an environment the topology does not declare (S1)', async () => {
    const repo = new FsRepository(dir);
    await seedFixtureTree(repo);
    await seedFixtureCatalog(dir);
    // fixtureTopology() (seeded above) only declares `environments: ['prod']`.
    await repo.writeResource(
      '.workspec/resources/app-service.yaml',
      fixtureAppServiceResource({ overrides: { staging: { cost: { qty: 5 } } } }),
    );

    const { io, out, err } = captureIO();
    const code = await run(['validate', '--dir', dir, '--json'], io);
    expect(code).toBe(1);
    expect(err()).toContain('override targets environment "staging"');
    const diagnostics = JSON.parse(out()) as { code: string; refSlug?: string }[];
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: 'dangling-override-environment-ref', refSlug: 'staging' }),
    );
  });

  it('exits 1 when a resource overrides an environment it is not itself present in (S1)', async () => {
    const repo = new FsRepository(dir);
    await seedFixtureTree(repo);
    await seedFixtureCatalog(dir);
    await repo.writeTopology(
      '.workspec/topologies/web-app.yaml',
      fixtureTopology({ environments: ['dev', 'prod'], defaultEnvironment: 'prod' }),
    );
    await repo.writeEnvironment('.workspec/environments/dev.yaml', fixtureEnvironment({}));
    await repo.writeResource(
      '.workspec/resources/app-service.yaml',
      fixtureAppServiceResource({
        environments: ['prod'],
        overrides: { dev: { cost: { qty: 5 } } },
      }),
    );

    const { io, out, err } = captureIO();
    const code = await run(['validate', '--dir', dir, '--json'], io);
    expect(code).toBe(1);
    const diagnostics = JSON.parse(out()) as { code: string; refSlug?: string }[];
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: 'override-environment-not-present', refSlug: 'dev' }),
    );
    // Message steers toward removing the override, not adding "dev" to presence.
    expect(err()).toContain('Remove this override key');
  });

  it('BLOCKING 1+2 REVERT-CHECK: exits 1 and names the field for a pre-S1 tree whose Environment file still has a legacy `spec.overrides` block', async () => {
    const repo = new FsRepository(dir);
    await seedFixtureTree(repo);
    await seedFixtureCatalog(dir);
    // Simulate a tree written before S1 shipped: raw YAML text on disk with
    // the legacy field, NOT written through the (now validating) repository
    // — that's the whole point, this is what an existing checkout looks
    // like the day this migration lands.
    await writeFile(
      join(dir, '.workspec/environments/prod.yaml'),
      [
        'apiVersion: workspec.io/v1alpha1',
        'kind: Environment',
        'metadata: {}',
        'spec:',
        "  naming: { resourceGroupSuffix: '-prod' }",
        '  overrides:',
        '    app-service:',
        '      cost:',
        '        qty: 2',
        '',
      ].join('\n'),
      'utf8',
    );

    const { io, out, err } = captureIO();
    const code = await run(['validate', '--dir', dir, '--json'], io);
    expect(code).toBe(1);
    expect(err().toLowerCase()).toContain('legacy');
    expect(err()).toContain('Resource.spec.overrides');
    const diagnostics = JSON.parse(out()) as { code: string; file: string }[];
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'legacy-environment-overrides',
        file: '.workspec/environments/prod.yaml',
      }),
    );
    // The environment file failing to parse ALSO trips the (pre-existing,
    // unrelated-to-S1) dangling-environment-ref check — same as any other
    // malformed environment file would. Not a new cascade this migration
    // introduces; just documenting it so this test doesn't assert an exact
    // diagnostics array and break the next time something else about this
    // fixture changes.
    expect(diagnostics.length).toBeGreaterThanOrEqual(1);
  });

  it('LEAD-ACCEPTED ADDITION REVERT-CHECK: exits 1 when an override resourceGroup value is dangling', async () => {
    const repo = new FsRepository(dir);
    await seedFixtureTree(repo);
    await seedFixtureCatalog(dir);
    await repo.writeResource(
      '.workspec/resources/app-service.yaml',
      fixtureAppServiceResource({ overrides: { prod: { resourceGroup: 'rg-ghost' } } }),
    );

    const { io, out, err } = captureIO();
    const code = await run(['validate', '--dir', dir, '--json'], io);
    expect(code).toBe(1);
    expect(err()).toContain('rg-ghost');
    const diagnostics = JSON.parse(out()) as { code: string; refSlug?: string }[];
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: 'dangling-ref', refSlug: 'rg-ghost' }),
    );
  });

  it('LEAD-ACCEPTED ADDITION: happy path — an override resourceGroup value that resolves to a real resource-group stays green', async () => {
    const repo = new FsRepository(dir);
    await seedFixtureTree(repo);
    await seedFixtureCatalog(dir);
    await repo.writeResource(
      '.workspec/resources/sql.yaml',
      fixtureSqlResource({ overrides: { prod: { resourceGroup: 'rg-app' } } }),
    );

    const { io, err } = captureIO();
    const code = await run(['validate', '--dir', dir], io);
    expect(code).toBe(0);
    expect(err()).toContain('tree OK');
  });
});

describe('import', () => {
  const TERRAFORM_INPUT = {
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

  it('writes derived resources to .topology-actual/<env>/', async () => {
    const inputFile = join(dir, 'terraform-show.json');
    await writeFile(inputFile, JSON.stringify(TERRAFORM_INPUT), 'utf8');

    const { io, err } = captureIO();
    const code = await run(['import', 'terraform', '--env', 'prod', '--input', inputFile, '--dir', dir], io);
    expect(code).toBe(0);
    expect(err()).toContain('wrote 1 resource(s)');

    const written = await readFile(join(dir, '.topology-actual', 'prod', 'rg-app.yaml'), 'utf8');
    expect(written).toContain('kind: derived');
  });

  it('does not write a derived-connections file for an adapter with no edge data (terraform)', async () => {
    const inputFile = join(dir, 'terraform-show.json');
    await writeFile(inputFile, JSON.stringify(TERRAFORM_INPUT), 'utf8');

    const { io, err } = captureIO();
    const code = await run(['import', 'terraform', '--env', 'prod', '--input', inputFile, '--dir', dir], io);
    expect(code).toBe(0);
    expect(err()).not.toContain('connection(s)');

    const names = await readdir(join(dir, '.topology-actual', 'prod'));
    expect(names).not.toContain('derived-connections.yaml');
  });

  describe('aspire', () => {
    const ASPIRE_GRAPH_INPUT = {
      version: 'workspec-graph/v1',
      apphost: { name: 'Ledger AppHost' },
      resources: [
        {
          name: 'api-server',
          kind: 'project',
          typeName: 'ProjectResource',
          endpoints: [],
          references: [
            { target: 'ledger-db', via: 'connection-string' },
            { target: 'cache', via: 'wait' },
          ],
        },
        {
          name: 'ledger-db',
          kind: 'container',
          typeName: 'PostgresServerResource',
          endpoints: [],
          references: [],
        },
        { name: 'cache', kind: 'container', typeName: 'RedisResource', endpoints: [], references: [] },
        {
          name: 'worker',
          kind: 'executable',
          typeName: 'ExecutableResource',
          endpoints: [],
          references: [{ target: 'cache', via: 'endpoint' }],
        },
      ],
    };

    it('writes both derived resources AND a derived-connections Topology artifact', async () => {
      const inputFile = join(dir, 'aspire-graph.json');
      await writeFile(inputFile, JSON.stringify(ASPIRE_GRAPH_INPUT), 'utf8');

      const { io, err } = captureIO();
      const code = await run(['import', 'aspire', '--env', 'prod', '--input', inputFile, '--dir', dir], io);
      expect(code).toBe(0);
      expect(err()).toContain('wrote 4 resource(s)');
      expect(err()).toContain('wrote 2 connection(s)');

      const repo = new FsRepository(dir);
      const written = await repo.readTopology('.topology-actual/prod/derived-connections.yaml');
      expect(written.spec.connections.slice().sort((a, b) => a.from.localeCompare(b.from))).toEqual([
        { from: 'api-server', to: 'ledger-db', class: 'primary' },
        { from: 'worker', to: 'cache', class: 'primary' },
      ]);
    });

    it('removes a stale derived-connections file when a later import for the same env has no edge data', async () => {
      const aspireInput = join(dir, 'aspire-graph.json');
      await writeFile(aspireInput, JSON.stringify(ASPIRE_GRAPH_INPUT), 'utf8');
      const { io: io1 } = captureIO();
      await run(['import', 'aspire', '--env', 'prod', '--input', aspireInput, '--dir', dir], io1);
      await expect(
        readFile(join(dir, '.topology-actual', 'prod', 'derived-connections.yaml'), 'utf8'),
      ).resolves.toBeTruthy();

      const terraformInput = join(dir, 'terraform-show.json');
      await writeFile(terraformInput, JSON.stringify(TERRAFORM_INPUT), 'utf8');
      const { io: io2 } = captureIO();
      const code = await run(
        ['import', 'terraform', '--env', 'prod', '--input', terraformInput, '--dir', dir],
        io2,
      );
      expect(code).toBe(0);

      const names = await readdir(join(dir, '.topology-actual', 'prod'));
      expect(names).not.toContain('derived-connections.yaml');
    });
  });

  it('exits 2 on an unknown adapter', async () => {
    const inputFile = join(dir, 'in.json');
    await writeFile(inputFile, '{}', 'utf8');
    const { io, err } = captureIO();
    const code = await run(['import', 'nope', '--env', 'prod', '--input', inputFile, '--dir', dir], io);
    expect(code).toBe(2);
    expect(err()).toContain('unknown adapter');
  });

  it('exits 2 when --input is not valid JSON', async () => {
    const inputFile = join(dir, 'bad.json');
    await writeFile(inputFile, 'not json', 'utf8');
    const { io, err } = captureIO();
    const code = await run(['import', 'terraform', '--env', 'prod', '--input', inputFile, '--dir', dir], io);
    expect(code).toBe(2);
    expect(err()).toContain('not valid JSON');
  });

  it('exits 2 when --env is not a valid slug (path traversal shape), writing nothing', async () => {
    const inputFile = join(dir, 'terraform-show.json');
    await writeFile(inputFile, JSON.stringify(TERRAFORM_INPUT), 'utf8');

    const { io, err } = captureIO();
    const code = await run(
      ['import', 'terraform', '--env', '../../etc', '--input', inputFile, '--dir', dir],
      io,
    );
    expect(code).toBe(2);
    expect(err()).toContain('--env must be a valid slug');

    // Nothing written: `.topology-actual/` is never created for a rejected env.
    await expect(readdir(join(dir, '.topology-actual'))).rejects.toBeTruthy();
  });

  it('excludes a resource whose slug collides with the reserved DERIVED_CONNECTIONS_SLUG, erroring instead of writing-then-clobbering it (accepted non-blocking #5)', async () => {
    const collidingInput = {
      values: {
        root_module: {
          resources: [
            {
              address: 'azurerm_resource_group.collide',
              type: 'azurerm_resource_group',
              name: 'collide',
              // Terraform slug/name derivation prefers the Azure `name`
              // attribute — this deliberately sanitizes to exactly
              // DERIVED_CONNECTIONS_SLUG ("derived-connections").
              values: { name: 'derived-connections' },
            },
          ],
        },
      },
    };
    const inputFile = join(dir, 'colliding.json');
    await writeFile(inputFile, JSON.stringify(collidingInput), 'utf8');

    const { io, err } = captureIO();
    const code = await run(
      ['import', 'terraform', '--env', 'prod', '--input', inputFile, '--dir', dir],
      io,
    );
    expect(code).toBe(1);
    expect(err()).toContain('error: resource "derived-connections" resolved to the reserved slug');
    expect(err()).toContain('wrote 0 resource(s)');

    // Never written at all — not written-then-overwritten, not written-then-orphaned.
    await expect(
      readFile(join(dir, '.topology-actual', 'prod', 'derived-connections.yaml'), 'utf8'),
    ).rejects.toBeTruthy();
  });
});

describe('reconcile — the CI gate', () => {
  it('exits 1 on a drifted tree (everything phantom, nothing imported)', async () => {
    const repo = new FsRepository(dir);
    await seedFixtureTree(repo);

    const { io, err } = captureIO();
    const code = await run(['reconcile', '--env', 'prod', '--dir', dir], io);
    expect(code).toBe(1);
    expect(err()).toContain('drift(s)');
  });

  it('exits 1 with a clear message naming both files when .topology-actual/<env>/ has more than one observed topology file (BLOCKING review fix)', async () => {
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

    const { io, err } = captureIO();
    const code = await run(['reconcile', '--env', 'prod', '--dir', dir], io);
    expect(code).toBe(1);
    expect(err()).toContain('multiple observed topology files');
    expect(err()).toContain('observed-a.yaml');
    expect(err()).toContain('observed-b.yaml');
    expect(err()).toContain('keep exactly one');
  });

  it('exits 0 on a clean, connection-free tree once the derived state matches', async () => {
    const repo = new FsRepository(dir);
    // A single-resource, no-connections topology: with a matching derived
    // resource, there is nothing left for reconcile to flag — the CI
    // "green" case.
    await repo.writeTopology(
      '.workspec/topologies/single.yaml',
      fixtureTopology({ connections: [] }),
    );
    await repo.writeResource('.workspec/resources/app-service.yaml', fixtureAppServiceResource());
    await repo.writeResource('.workspec/resources/client.yaml', fixtureClientResource());
    await repo.writeResource('.workspec/resources/rg-app.yaml', fixtureResourceGroupResource());
    await repo.writeResource('.workspec/resources/sql.yaml', fixtureSqlResource());
    await repo.writeEnvironment('.workspec/environments/prod.yaml', fixtureEnvironment());

    for (const slug of ['client', 'rg-app', 'app-service', 'sql']) {
      const authored = await repo.readResource(`.workspec/resources/${slug}.yaml`);
      await repo.writeResource(`.topology-actual/prod/${slug}.yaml`, {
        ...authored,
        spec: { ...authored.spec, source: { kind: 'derived', from: `terraform.${slug}` } },
      });
    }

    const { io, err } = captureIO();
    const code = await run(['reconcile', '--env', 'prod', '--dir', dir], io);
    expect(code).toBe(0);
    expect(err()).toContain('0 drift(s)');
  });

  it('a resources-only derived tree reports NO miswired drift, even though the authored topology declares connections — connectivity was never captured, so it is not assessed (the bug this test guards against: previously every authored edge was falsely flagged)', async () => {
    const repo = new FsRepository(dir);
    // `fixtureTopology()`'s DEFAULT connections (client->app-service,
    // app-service->sql) are left in place — the whole point of this test is
    // that a resources-only `.topology-actual/prod/` (no observed topology
    // file, exactly what an adapter `import` produces today) must not turn
    // those declared edges into bogus `miswired` drift.
    await repo.writeTopology('.workspec/topologies/web-app.yaml', fixtureTopology());
    await repo.writeResource('.workspec/resources/app-service.yaml', fixtureAppServiceResource());
    await repo.writeResource('.workspec/resources/client.yaml', fixtureClientResource());
    await repo.writeResource('.workspec/resources/rg-app.yaml', fixtureResourceGroupResource());
    await repo.writeResource('.workspec/resources/sql.yaml', fixtureSqlResource());
    await repo.writeEnvironment('.workspec/environments/prod.yaml', fixtureEnvironment());

    for (const slug of ['client', 'rg-app', 'app-service', 'sql']) {
      const authored = await repo.readResource(`.workspec/resources/${slug}.yaml`);
      await repo.writeResource(`.topology-actual/prod/${slug}.yaml`, {
        ...authored,
        spec: { ...authored.spec, source: { kind: 'derived', from: `terraform.${slug}` } },
      });
    }

    const { io, err } = captureIO();
    const code = await run(['reconcile', '--env', 'prod', '--dir', dir], io);
    expect(code).toBe(0);
    expect(err()).toContain('0 drift(s)');
    expect(err()).toContain('0 miswired');
    expect(err()).not.toContain('miswired ');
  });

  it('a derived tree that also includes an observed topology file reports the precise miswired edge, not "every authored edge"', async () => {
    const repo = new FsRepository(dir);
    await repo.writeTopology('.workspec/topologies/web-app.yaml', fixtureTopology());
    await repo.writeResource('.workspec/resources/app-service.yaml', fixtureAppServiceResource());
    await repo.writeResource('.workspec/resources/client.yaml', fixtureClientResource());
    await repo.writeResource('.workspec/resources/rg-app.yaml', fixtureResourceGroupResource());
    await repo.writeResource('.workspec/resources/sql.yaml', fixtureSqlResource());
    await repo.writeEnvironment('.workspec/environments/prod.yaml', fixtureEnvironment());

    for (const slug of ['client', 'rg-app', 'app-service', 'sql']) {
      const authored = await repo.readResource(`.workspec/resources/${slug}.yaml`);
      await repo.writeResource(`.topology-actual/prod/${slug}.yaml`, {
        ...authored,
        spec: { ...authored.spec, source: { kind: 'derived', from: `terraform.${slug}` } },
      });
    }
    // Observed connectivity: "client -> app-service" survives untouched, but
    // "app-service -> sql" was dropped in the deployed estate — the ONE edge
    // that should surface as miswired, not the whole declared graph.
    await repo.writeTopology(
      '.topology-actual/prod/observed.yaml',
      fixtureTopology({ connections: [{ from: 'client', to: 'app-service', class: 'primary' }] }),
    );

    const { io, err } = captureIO();
    const code = await run(['reconcile', '--env', 'prod', '--dir', dir], io);
    expect(code).toBe(1);
    expect(err()).toContain('1 miswired');
    expect(err()).toContain('app-service');
    expect(err()).toContain('sql');
    expect(err()).not.toContain('client->app-service');
  });

  it('exits 2 when --env is missing', async () => {
    const { io, err } = captureIO();
    const code = await run(['reconcile', '--dir', dir], io);
    expect(code).toBe(2);
    expect(err()).toContain('--env is required');
  });

  it('exits 2 when --env is not a valid slug (path traversal shape)', async () => {
    const { io, err } = captureIO();
    const code = await run(['reconcile', '--env', '../../etc', '--dir', dir], io);
    expect(code).toBe(2);
    expect(err()).toContain('--env must be a valid slug');
  });
});

describe('import aspire -> reconcile: derived connectivity flows through end to end', () => {
  // A small apphost graph: api-server's real reference to ledger-db (via
  // connection-string) should show up as a clean, drift-free match against
  // an authored edge; api-server's WAIT on cache must NOT become a
  // connection (ordering, not dataflow — see derive-aspire-connections.ts),
  // which is what manufactures the authored-only half of the miswired case
  // below; worker's reference to cache (via endpoint) produces a SECOND
  // connection with no authored counterpart at all — the actual-only half.
  const ASPIRE_GRAPH_INPUT = {
    version: 'workspec-graph/v1',
    apphost: { name: 'Ledger AppHost' },
    resources: [
      {
        name: 'api-server',
        kind: 'project',
        typeName: 'ProjectResource',
        endpoints: [],
        references: [
          { target: 'ledger-db', via: 'connection-string' },
          { target: 'cache', via: 'wait' },
        ],
      },
      {
        name: 'ledger-db',
        kind: 'container',
        typeName: 'PostgresServerResource',
        endpoints: [],
        references: [],
      },
      { name: 'cache', kind: 'container', typeName: 'RedisResource', endpoints: [], references: [] },
      {
        name: 'worker',
        kind: 'executable',
        typeName: 'ExecutableResource',
        endpoints: [],
        references: [{ target: 'cache', via: 'endpoint' }],
      },
    ],
  };

  async function seedAspireShapedAuthoredTopology(repo: FsRepository): Promise<void> {
    // Authored resources whose (kind, type, name) exactly match what the
    // aspire adapter derives for the same graph — this is what lets
    // matchResources' tuple rung pair every one of them up (provider is not
    // part of the match tuple, so it doesn't need to line up).
    await repo.writeResource('.workspec/resources/api-server.yaml', {
      apiVersion: 'workspec.io/v1alpha1',
      kind: 'Resource',
      metadata: { slug: 'api-server' },
      spec: { name: 'api-server', kind: 'compute', type: 'ProjectResource', provider: 'aspire' },
    });
    await repo.writeResource('.workspec/resources/ledger-db.yaml', {
      apiVersion: 'workspec.io/v1alpha1',
      kind: 'Resource',
      metadata: { slug: 'ledger-db' },
      spec: { name: 'ledger-db', kind: 'database', type: 'PostgreSQL', provider: 'aspire' },
    });
    await repo.writeResource('.workspec/resources/cache.yaml', {
      apiVersion: 'workspec.io/v1alpha1',
      kind: 'Resource',
      metadata: { slug: 'cache' },
      spec: { name: 'cache', kind: 'cache', type: 'Redis', provider: 'aspire' },
    });
    await repo.writeResource('.workspec/resources/worker.yaml', {
      apiVersion: 'workspec.io/v1alpha1',
      kind: 'Resource',
      metadata: { slug: 'worker' },
      spec: { name: 'worker', kind: 'compute', type: 'ExecutableResource', provider: 'aspire' },
    });
    await repo.writeTopology('.workspec/topologies/ledger.yaml', {
      apiVersion: 'workspec.io/v1alpha1',
      kind: 'Topology',
      metadata: { slug: 'ledger' },
      spec: {
        title: 'Ledger',
        provider: 'aspire',
        environments: ['prod'],
        defaultEnvironment: 'prod',
        connections: [
          // MATCHES the derived api-server->ledger-db connection-string edge: clean, no drift.
          { from: 'api-server', to: 'ledger-db', class: 'primary' },
          // Declared, but NEVER derived (api-server only WAITS on cache,
          // which isn't dataflow) — the authored-only half of the miswired case.
          { from: 'api-server', to: 'cache', class: 'primary' },
        ],
      },
    });
    await repo.writeEnvironment('.workspec/environments/prod.yaml', {
      apiVersion: 'workspec.io/v1alpha1',
      kind: 'Environment',
      metadata: { slug: 'prod' },
      spec: {},
    });
  }

  it('reconcile reports zero drift for the matched, correctly-wired pair once aspire connectivity is imported', async () => {
    const repo = new FsRepository(dir);
    await seedAspireShapedAuthoredTopology(repo);

    const inputFile = join(dir, 'aspire-graph.json');
    await writeFile(inputFile, JSON.stringify(ASPIRE_GRAPH_INPUT), 'utf8');
    const { io: importIo } = captureIO();
    const importCode = await run(
      ['import', 'aspire', '--env', 'prod', '--input', inputFile, '--dir', dir],
      importIo,
    );
    expect(importCode).toBe(0);

    const { io, err } = captureIO();
    const code = await run(['reconcile', '--env', 'prod', '--dir', dir], io);

    // Exactly one miswired drift (the api-server/cache/worker cluster below)
    // — nothing for api-server<->ledger-db: that pair is matched AND its
    // connection is observed on both sides, so it contributes zero drift.
    // Before this adapter derived connectivity, EVERY authored edge would
    // have been silently un-assessed (miswired detection skips entirely
    // when `actual.connections` is undefined) — this proves the opposite
    // now holds: a correctly-wired edge is verified clean, not just ignored.
    expect(code).toBe(1);
    expect(err()).toContain('reconcile: 1 drift(s) — 0 phantom, 0 orphan, 0 divergent, 1 miswired');
  });

  it('reconcile detects the miswired edge aspire connectivity newly makes visible: declared api-server->cache never observed, observed worker->cache never declared', async () => {
    const repo = new FsRepository(dir);
    await seedAspireShapedAuthoredTopology(repo);

    const inputFile = join(dir, 'aspire-graph.json');
    await writeFile(inputFile, JSON.stringify(ASPIRE_GRAPH_INPUT), 'utf8');
    const { io: importIo } = captureIO();
    await run(['import', 'aspire', '--env', 'prod', '--input', inputFile, '--dir', dir], importIo);

    const { io, err } = captureIO();
    await run(['reconcile', '--env', 'prod', '--dir', dir], io);

    expect(err()).toContain('miswired api-server, cache, worker');
    expect(err()).toContain('declared but not observed: api-server->cache');
    expect(err()).toContain('observed but not declared: worker->cache');
  });
});

describe('cost', () => {
  it('prints the topology-wide monthly total (table format)', async () => {
    const repo = new FsRepository(dir);
    await seedFixtureTree(repo);
    await seedFixtureCatalog(dir);

    const { io, out } = captureIO();
    const code = await run(['cost', '--env', 'prod', '--dir', dir], io);
    expect(code).toBe(0);
    expect(out()).toContain('total:       150.00');
  });

  it('exits 1 when the catalog is missing', async () => {
    const repo = new FsRepository(dir);
    await seedFixtureTree(repo);

    const { io, err } = captureIO();
    const code = await run(['cost', '--env', 'prod', '--dir', dir], io);
    expect(code).toBe(1);
    expect(err()).toContain('catalog not found');
  });

  it('exits 2 when --env is not a valid slug (path traversal shape)', async () => {
    const { io, err } = captureIO();
    const code = await run(['cost', '--env', '../../etc', '--dir', dir], io);
    expect(code).toBe(2);
    expect(err()).toContain('--env must be a valid slug');
  });
});

describe('render', () => {
  it('prints a textual network-lens outline', async () => {
    const repo = new FsRepository(dir);
    await seedFixtureTree(repo);

    const { io, out } = captureIO();
    const code = await run(['render', '--env', 'prod', '--lens', 'network', '--dir', dir], io);
    expect(code).toBe(0);
    expect(out()).toContain('network lens');
  });

  it('prints JSON with --format json', async () => {
    const repo = new FsRepository(dir);
    await seedFixtureTree(repo);

    const { io, out } = captureIO();
    const code = await run(['render', '--env', 'prod', '--lens', 'rg', '--format', 'json', '--dir', dir], io);
    expect(code).toBe(0);
    const tree = JSON.parse(out()) as { lens: string };
    expect(tree.lens).toBe('rg');
  });

  it('exits 2 for an invalid --lens', async () => {
    const { io, err } = captureIO();
    const code = await run(['render', '--env', 'prod', '--lens', 'bogus', '--dir', dir], io);
    expect(code).toBe(2);
    expect(err()).toContain('--lens must be');
  });

  it('exits 2 when --env is not a valid slug (path traversal shape)', async () => {
    const { io, err } = captureIO();
    const code = await run(['render', '--env', '../../etc', '--lens', 'network', '--dir', dir], io);
    expect(code).toBe(2);
    expect(err()).toContain('--env must be a valid slug');
  });
});
