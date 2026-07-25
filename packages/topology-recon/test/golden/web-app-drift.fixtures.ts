import {
  API_VERSION,
  EnvironmentArtifact,
  ResourceArtifact,
  TopologyArtifact,
} from '@workspec/topology-schema';
import type { Environment, Resource, Topology } from '@workspec/topology-schema';
import { resolve } from '@workspec/topology-model';
import type { ResolvedTopology } from '@workspec/topology-model';
import type { DerivedTopology } from '../../src/model/derived-topology.types.js';

// A small, self-contained "web-app" scenario built specifically to exercise
// every drift class in one reconciliation — NOT a copy of
// `@workspec/topology-schema`'s own web-app fixture (that fixture's actual
// values don't need to, and don't, line up with the specific drift numbers
// this golden test asserts). The authored half is real `Resource`/`Topology`/
// `Environment` artifacts run through `@workspec/topology-model`'s `resolve()`
// (so this test locks recon's contract against `resolve()`'s real output
// shape, not a hand-rolled stand-in for it); the actual half is a hand-built
// `DerivedTopology`, standing in for what a future CLI/studio phase would
// build from `@workspec/topology-adapters` output.

function makeResource(slug: string, spec: Resource['spec']): Resource {
  return ResourceArtifact.parse({
    apiVersion: API_VERSION,
    kind: 'Resource',
    metadata: { slug },
    spec,
  });
}

/**
 * Resolves the authored side of the scenario for `prod`: an app-service
 * fronting a SQL database (routed through a private endpoint), a Redis
 * cache, an AI Search resource, all grouped under one resource group.
 */
export function buildAuthoredResolvedTopology(): ResolvedTopology {
  const resources = new Map<string, Resource>([
    [
      'rg-app',
      makeResource('rg-app', {
        name: 'App Resource Group',
        kind: 'resource-group',
        type: 'Azure Resource Group',
        provider: 'azure',
      }),
    ],
    [
      'client',
      makeResource('client', {
        name: 'Client',
        kind: 'client',
        type: 'Browser',
        provider: 'azure',
      }),
    ],
    [
      'app-service',
      makeResource('app-service', {
        name: 'App Service',
        kind: 'compute',
        type: 'Azure App Service',
        provider: 'azure',
        resourceGroup: 'rg-app',
        config: { tier: 'P1v3' },
        cost: { sku: 'p1v3', mode: 'payg', schedule: 'always', qty: 2 },
      }),
    ],
    [
      'sql',
      makeResource('sql', {
        name: 'SQL Database',
        kind: 'database',
        type: 'Azure SQL Database',
        provider: 'azure',
        resourceGroup: 'rg-app',
      }),
    ],
    [
      'sql-pe',
      makeResource('sql-pe', {
        name: 'SQL Private Endpoint',
        kind: 'endpoint',
        type: 'Private Endpoint',
        provider: 'azure',
        resourceGroup: 'rg-app',
      }),
    ],
    [
      'cache',
      makeResource('cache', {
        name: 'Redis Cache',
        kind: 'cache',
        type: 'Azure Cache for Redis',
        provider: 'azure',
        resourceGroup: 'rg-app',
        config: { sku: 'Balanced', tier: 'B2', zoneRedundant: true },
        cost: { sku: 'balanced-b2', mode: 'payg', schedule: 'always', qty: 1 },
      }),
    ],
    [
      'search',
      makeResource('search', {
        name: 'AI Search',
        kind: 'search',
        type: 'Azure AI Search',
        provider: 'azure',
        resourceGroup: 'rg-app',
      }),
    ],
  ]);

  const topology: Topology = TopologyArtifact.parse({
    apiVersion: API_VERSION,
    kind: 'Topology',
    metadata: { slug: 'web-app' },
    spec: {
      title: 'Web App',
      provider: 'azure',
      environments: ['prod'],
      defaultEnvironment: 'prod',
      connections: [
        { from: 'client', to: 'app-service' },
        { from: 'app-service', to: 'sql-pe' },
        { from: 'sql-pe', to: 'sql' },
        { from: 'app-service', to: 'cache' },
        { from: 'app-service', to: 'search' },
      ],
    },
  });

  const environments = new Map<string, Environment>([
    [
      'prod',
      EnvironmentArtifact.parse({
        apiVersion: API_VERSION,
        kind: 'Environment',
        metadata: { slug: 'prod' },
        spec: { naming: { resourceGroupSuffix: '-prod' } },
      }),
    ],
  ]);

  return resolve(topology, resources, environments, 'prod');
}

/**
 * The deliberately-drifted actual deployed state for `prod`, standing in for
 * `@workspec/topology-adapters` output against the `.topology-actual/prod/`
 * tree. Every adapter-derived resource sets `resourceGroup: null` (this
 * scenario mirrors the bicep adapter's documented caveat) and a `source.from`
 * that never coincides with the authored side's (which has none at all) —
 * so every match below falls through rung 1 to the rung-2 tuple match.
 *
 * Exercises all four drift classes against `buildAuthoredResolvedTopology()`:
 * - `divergent`: `app-service` (P1v3 ×2 authored vs P0v3 ×1 actual).
 * - `divergent`: `cache` (Balanced B2 zone-redundant authored vs Basic C1
 *   single-zone actual).
 * - `phantom`: authored `search` has no counterpart here at all.
 * - `orphan`: `diag-storage` here is declared nowhere in the authored side.
 * - `miswired`: `app-service` connects directly to `sql`, bypassing the
 *   authored `sql-pe` private-endpoint hop (`sql-pe` itself is still deployed
 *   and still matches — it's just no longer wired into the path).
 */
export function buildActualDerivedTopology(): DerivedTopology {
  return {
    envSlug: 'prod',
    resources: [
      {
        slug: 'rg-app-01',
        name: 'App Resource Group',
        kind: 'resource-group',
        type: 'Azure Resource Group',
        provider: 'azure',
        resourceGroup: null,
        config: null,
        cost: null,
        source: { kind: 'derived', from: 'Microsoft.Resources/resourceGroups:rg-app-01' },
      },
      {
        slug: 'client-vm',
        name: 'Client',
        kind: 'client',
        type: 'Browser',
        provider: 'azure',
        resourceGroup: null,
        config: null,
        cost: null,
        source: { kind: 'derived', from: 'client-vm' },
      },
      {
        slug: 'app-service-01',
        name: 'App Service',
        kind: 'compute',
        type: 'Azure App Service',
        provider: 'azure',
        resourceGroup: null,
        config: { tier: 'P0v3' },
        cost: { sku: 'p0v3', mode: 'payg', schedule: 'always', qty: 1 },
        source: { kind: 'derived', from: 'Microsoft.Web/sites:app-service-01' },
      },
      {
        slug: 'sql-01',
        name: 'SQL Database',
        kind: 'database',
        type: 'Azure SQL Database',
        provider: 'azure',
        resourceGroup: null,
        config: null,
        cost: null,
        source: { kind: 'derived', from: 'Microsoft.Sql/servers/databases:sql-01' },
      },
      {
        slug: 'sql-pe-01',
        name: 'SQL Private Endpoint',
        kind: 'endpoint',
        type: 'Private Endpoint',
        provider: 'azure',
        resourceGroup: null,
        config: null,
        cost: null,
        source: { kind: 'derived', from: 'Microsoft.Network/privateEndpoints:sql-pe-01' },
      },
      {
        slug: 'cache-01',
        name: 'Redis Cache',
        kind: 'cache',
        type: 'Azure Cache for Redis',
        provider: 'azure',
        resourceGroup: null,
        config: { sku: 'Basic', tier: 'C1', zoneRedundant: false },
        cost: { sku: 'basic-c1', mode: 'payg', schedule: 'always', qty: 1 },
        source: { kind: 'derived', from: 'Microsoft.Cache/redis:cache-01' },
      },
      {
        slug: 'diag-storage',
        name: 'Diagnostics Storage',
        kind: 'storage',
        type: 'Azure Storage Account',
        provider: 'azure',
        resourceGroup: null,
        config: null,
        cost: null,
        source: { kind: 'derived', from: 'Microsoft.Storage/storageAccounts:diag-storage' },
      },
    ],
    connections: [
      { from: 'client-vm', to: 'app-service-01', class: 'primary' },
      { from: 'app-service-01', to: 'sql-01', class: 'primary' },
      { from: 'app-service-01', to: 'cache-01', class: 'primary' },
    ],
  };
}
