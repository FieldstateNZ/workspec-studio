// Test-only helper: a deliberately-drifted `DerivedTopology` for 'prod',
// built to pair against `readWebAppFixtureSeed()`'s SAME golden "web-app"
// topology (`@workspec/topology-schema`'s fixture — the one every other
// test in this package already resolves) rather than vendoring
// `@workspec/topology-recon`'s own, differently-shaped drift fixture. This
// exercises the real `reconcile()` contract against the SAME resolved
// topology this package's other golden tests already use, all four drift
// classes at once:
//
// - `phantom`: authored `app-insights` has no counterpart here at all.
// - `orphan`: `diag-storage` here is declared nowhere in the authored side.
// - `divergent`: `app-service` (prod overrides to sku `p2v3` × 3; actual is
//   `p0v3` × 1, config tier `P0v3` vs authored `P1v3`).
// - `miswired`: authored declares `write-fn -> sql`; actual omits it and
//   instead routes `write-fn -> app-service` (a genuine reroute: one
//   authored-only edge removed, one actual-only edge added, clustered
//   together since both touch `write-fn`) — this is what renders the Drift
//   view's ghost reroute edge (`buildGhostEdges` only ever draws the
//   ACTUAL-only side of a miswired cluster).

import type { DerivedTopology } from '@workspec/topology-recon';

/** The drifted actual/derived state for the web-app fixture's `prod` environment. */
export function buildDriftedWebAppDerivedTopology(): DerivedTopology {
  return {
    envSlug: 'prod',
    resources: [
      {
        slug: 'app-service',
        name: 'Web App Service',
        kind: 'compute',
        type: 'Azure App Service',
        provider: 'azure',
        resourceGroup: null,
        config: { tier: 'P0v3' },
        cost: { sku: 'p0v3', mode: 'payg', schedule: 'always', qty: 1 },
        source: { kind: 'derived', from: 'Microsoft.Web/sites/app-service-actual' },
      },
      {
        slug: 'sql',
        name: 'Primary database',
        kind: 'database',
        type: 'Azure SQL Database',
        provider: 'azure',
        resourceGroup: null,
        config: null,
        cost: { sku: 'gp-gen5-2', mode: 'payg', schedule: 'always', qty: 1 },
        source: { kind: 'derived', from: 'Microsoft.Sql/servers/databases/sql-actual' },
      },
      {
        slug: 'cache',
        name: 'Session cache',
        kind: 'cache',
        type: 'Azure Cache for Redis',
        provider: 'azure',
        resourceGroup: null,
        config: { sku: 'Standard' },
        cost: { sku: 'standard-c1', mode: 'payg', schedule: 'always', qty: 1 },
        source: { kind: 'derived', from: 'Microsoft.Cache/redis/cache-actual' },
      },
      {
        slug: 'write-fn',
        name: 'Write path function',
        kind: 'function',
        type: 'Azure Functions',
        provider: 'azure',
        resourceGroup: null,
        config: null,
        cost: { sku: 'consumption', mode: 'payg', schedule: 'always', qty: 1 },
        source: { kind: 'derived', from: 'Microsoft.Web/sites/write-fn-actual' },
      },
      {
        slug: 'front-door',
        name: 'Front Door',
        kind: 'edge',
        type: 'Azure Front Door',
        provider: 'azure',
        resourceGroup: null,
        config: null,
        cost: { sku: 'standard', mode: 'payg', schedule: 'always', qty: 1 },
        source: { kind: 'derived', from: 'Microsoft.Cdn/profiles/front-door-actual' },
      },
      {
        slug: 'client',
        name: 'Browser client',
        kind: 'client',
        type: 'Web browser',
        provider: 'azure',
        resourceGroup: null,
        config: null,
        cost: null,
        source: { kind: 'derived', from: 'external' },
      },
      {
        slug: 'rg-app',
        name: 'App resource group',
        kind: 'resource-group',
        type: 'Azure Resource Group',
        provider: 'azure',
        resourceGroup: null,
        config: null,
        cost: null,
        source: { kind: 'derived', from: 'Microsoft.Resources/resourceGroups/rg-app-actual' },
      },
      {
        slug: 'core-vnet',
        name: 'Core virtual network',
        kind: 'vnet',
        type: 'Azure Virtual Network',
        provider: 'azure',
        resourceGroup: null,
        config: null,
        cost: null,
        source: { kind: 'derived', from: 'Microsoft.Network/virtualNetworks/core-vnet-actual' },
      },
      {
        slug: 'snet-workload',
        name: 'Workload subnet',
        kind: 'subnet',
        type: 'Azure Subnet',
        provider: 'azure',
        resourceGroup: null,
        config: null,
        cost: null,
        source: {
          kind: 'derived',
          from: 'Microsoft.Network/virtualNetworks/core-vnet/subnets/snet-workload-actual',
        },
      },
      {
        slug: 'redis-pe',
        name: 'Redis private endpoint',
        kind: 'endpoint',
        type: 'Private Endpoint',
        provider: 'azure',
        resourceGroup: null,
        config: null,
        cost: null,
        source: { kind: 'derived', from: 'Microsoft.Network/privateEndpoints/redis-pe-actual' },
      },
      {
        slug: 'diag-storage',
        name: 'Diagnostics storage',
        kind: 'storage',
        type: 'Azure Storage Account',
        provider: 'azure',
        resourceGroup: null,
        config: { kind: 'StorageV2', redundancy: 'LRS' },
        cost: { sku: 'storage-lrs', mode: 'payg', schedule: 'always', qty: 1 },
        source: { kind: 'derived', from: 'Microsoft.Storage/storageAccounts/diagsa7f3' },
      },
    ],
    connections: [
      { from: 'client', to: 'front-door', class: 'primary' },
      { from: 'front-door', to: 'app-service', class: 'primary' },
      { from: 'app-service', to: 'cache', class: 'primary' },
      { from: 'app-service', to: 'sql', class: 'primary' },
      { from: 'write-fn', to: 'cache', class: 'primary' },
      // `write-fn -> sql` is authored (see web-app.topology.yaml) but
      // deliberately OMITTED here, replaced by this actual-only reroute —
      // together, the miswired scenario (see this file's header comment).
      { from: 'write-fn', to: 'app-service', class: 'primary' },
    ],
  };
}
