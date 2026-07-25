// Shared test fixtures for topology-studio's own test suites (fs-repository,
// mcp-provider, server, cli). NOT a `*.test.ts` file — vitest's `include`
// glob never picks this up — and not exported from `index.ts`; it exists
// purely so every suite seeds the same small, internally-consistent tree
// (one topology, two priced resources + a resource-group container, one
// environment, one catalog pricing both SKUs) instead of five divergent
// ad hoc fixtures. Field values are lifted from
// `@workspec/topology-schema`'s own `test/fixtures/valid/*.yaml` where they
// overlap (kind/type strings), so a resource here matches the shape a real
// authored fixture uses.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { stringify } from 'yaml';
import { CATALOG_SCHEMA_DIRECTIVE, typeDirectoryFor } from '@workspec/decision-schema';
import type { Catalog } from '@workspec/decision-schema';
import type { Environment, Resource, Topology } from '@workspec/topology-schema';
import type { FsRepository } from './fs-repository.js';

/** The catalog slug `fixtureTopology()` declares. */
export const FIXTURE_CATALOG_SLUG = 'azure-nz';

export function fixtureTopology(overrides: Partial<Topology['spec']> = {}): Topology {
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Topology',
    metadata: { slug: 'web-app' },
    spec: {
      title: 'Web App',
      provider: 'azure',
      environments: ['prod'],
      defaultEnvironment: 'prod',
      catalog: FIXTURE_CATALOG_SLUG,
      connections: [
        { from: 'client', to: 'app-service', class: 'primary' },
        { from: 'app-service', to: 'sql', class: 'primary' },
      ],
      ...overrides,
    },
  };
}

export function fixtureClientResource(): Resource {
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Resource',
    metadata: { slug: 'client' },
    spec: { name: 'Browser Client', kind: 'client', type: 'Browser', provider: 'azure' },
  };
}

export function fixtureResourceGroupResource(): Resource {
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Resource',
    metadata: { slug: 'rg-app' },
    spec: { name: 'rg-app', kind: 'resource-group', type: 'Azure Resource Group', provider: 'azure' },
  };
}

export function fixtureAppServiceResource(overrides: Partial<Resource['spec']> = {}): Resource {
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Resource',
    metadata: { slug: 'app-service' },
    spec: {
      name: 'Web App Service',
      kind: 'compute',
      type: 'Azure App Service',
      provider: 'azure',
      resourceGroup: 'rg-app',
      cost: { sku: 'app-service-p1v3', mode: 'payg', schedule: 'always', qty: 1 },
      ...overrides,
    },
  };
}

export function fixtureSqlResource(overrides: Partial<Resource['spec']> = {}): Resource {
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Resource',
    metadata: { slug: 'sql' },
    spec: {
      name: 'Orders DB',
      kind: 'database',
      type: 'Azure SQL Database',
      provider: 'azure',
      resourceGroup: 'rg-app',
      cost: { sku: 'sql-s0', mode: 'payg', schedule: 'always', qty: 1 },
      ...overrides,
    },
  };
}

export function fixtureEnvironment(overrides: Partial<Environment['spec']> = {}): Environment {
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Environment',
    metadata: { slug: 'prod' },
    spec: { naming: { resourceGroupSuffix: '-prod' }, ...overrides },
  };
}

/**
 * Writes the standard fixture tree (one topology, three resources, one
 * environment) into `repo`'s root via the repository's own `write*` methods
 * — every suite that needs "a clean, coherent tree" starts from this.
 */
export async function seedFixtureTree(repo: FsRepository): Promise<void> {
  await repo.writeTopology('.workspec/topologies/web-app.yaml', fixtureTopology());
  await repo.writeResource('.workspec/resources/client.yaml', fixtureClientResource());
  await repo.writeResource('.workspec/resources/rg-app.yaml', fixtureResourceGroupResource());
  await repo.writeResource('.workspec/resources/app-service.yaml', fixtureAppServiceResource());
  await repo.writeResource('.workspec/resources/sql.yaml', fixtureSqlResource());
  await repo.writeEnvironment('.workspec/environments/prod.yaml', fixtureEnvironment());
}

/**
 * Writes `fixtureCatalog()` directly to `<root>/.workspec/catalogs/azure-nz.yaml`
 * — plain (non-comment-preserving) YAML, since topology-studio never writes
 * a catalog itself; it only reads one. Bypasses `FsRepository` (which has no
 * catalog methods — catalogs are `@workspec/decision-schema`'s own kind).
 */
export async function seedFixtureCatalog(root: string): Promise<void> {
  const path = join(root, typeDirectoryFor('Catalog'), `${FIXTURE_CATALOG_SLUG}.yaml`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${CATALOG_SCHEMA_DIRECTIVE}${stringify(fixtureCatalog())}`, 'utf8');
}

export function fixtureCatalog(): Catalog {
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Catalog',
    metadata: { slug: FIXTURE_CATALOG_SLUG },
    spec: {
      currency: 'NZD',
      asOf: '2026-07-01',
      pricingModes: [{ id: 'payg', label: 'Pay as you go', mult: 1, committed: false }],
      schedules: [{ id: 'always', label: '24x7', pct: 1 }],
      skus: [
        { id: 'app-service-p1v3', label: 'App Service P1v3', family: 'Web', price: 100 },
        { id: 'sql-s0', label: 'SQL S0', family: 'Database', price: 50 },
      ],
    },
  };
}
