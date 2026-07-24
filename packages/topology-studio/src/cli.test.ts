import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
});
