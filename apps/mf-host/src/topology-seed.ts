// A compact, self-contained topology tree for the smoke host: one Topology
// (two environments, three declared connections), three Resources (a
// client, an App Service, and a SQL database), and two Environments
// (dev/prod, naming conventions only — no per-env resource overrides in
// this seed) — enough surface to
// exercise TopologyWorkbench's env switcher, canvas, and side panel without
// needing a real `.workspec/` tree on disk. Built directly against
// `@workspec/topology-model`'s `createMemorySource` (the same host-agnostic,
// `TopologyFileSource`-shaped in-memory seed `bootstrap.tsx` already uses
// for the c4-ui remote's `createMemorySource`) — a host-owned literal YAML
// tree, not a copy of `@workspec/topology-schema`'s own test fixtures (which
// aren't exported for a host to import). Deliberately NOT sourced from
// `@workspec/topology-studio`'s FsRepository/test-fixtures — those are
// filesystem-backed and internal to that package; a browser host has no
// filesystem to read from at all, which is exactly what
// `TopologyStudioHost.source` (a `TopologyFileSource`) abstracts over.
import { createMemorySource } from '@workspec/topology-model';
import type { TopologyFileSource } from '@workspec/topology-model';

/** Ref of the one topology this seed declares — pass as `initialEnv`/routing context if a host ever needs it. */
export const TOPOLOGY_REF = '.workspec/topologies/web-app.yaml';

const TOPOLOGY_YAML = `# yaml-language-server: $schema=https://schema.workspec.io/v1alpha1/topology.schema.json
apiVersion: workspec.io/v1alpha1
kind: Topology
metadata:
  slug: web-app
spec:
  title: 'MF Host Web App'
  provider: azure
  environments: [dev, prod]
  defaultEnvironment: prod
  connections:
    - from: client
      to: app-service
      class: primary
    - from: app-service
      to: sql
      class: primary
    - from: app-service
      to: sql
      class: telemetry
`;

const CLIENT_RESOURCE_YAML = `# yaml-language-server: $schema=https://schema.workspec.io/v1alpha1/resource.schema.json
apiVersion: workspec.io/v1alpha1
kind: Resource
metadata:
  slug: client
spec:
  name: 'Browser client'
  kind: client
  type: 'Web browser'
  provider: azure
`;

const APP_SERVICE_RESOURCE_YAML = `# yaml-language-server: $schema=https://schema.workspec.io/v1alpha1/resource.schema.json
apiVersion: workspec.io/v1alpha1
kind: Resource
metadata:
  slug: app-service
spec:
  name: 'Web App Service'
  kind: compute
  type: 'Azure App Service'
  provider: azure
  resourceGroup: rg-app
`;

const SQL_RESOURCE_YAML = `# yaml-language-server: $schema=https://schema.workspec.io/v1alpha1/resource.schema.json
apiVersion: workspec.io/v1alpha1
kind: Resource
metadata:
  slug: sql
spec:
  name: 'Orders DB'
  kind: database
  type: 'Azure SQL Database'
  provider: azure
  resourceGroup: rg-app
`;

const DEV_ENVIRONMENT_YAML = `# yaml-language-server: $schema=https://schema.workspec.io/v1alpha1/environment.schema.json
apiVersion: workspec.io/v1alpha1
kind: Environment
metadata:
  slug: dev
spec:
  naming:
    resourceGroupSuffix: '-dev'
`;

const PROD_ENVIRONMENT_YAML = `# yaml-language-server: $schema=https://schema.workspec.io/v1alpha1/environment.schema.json
apiVersion: workspec.io/v1alpha1
kind: Environment
metadata:
  slug: prod
spec:
  naming:
    resourceGroupSuffix: '-prod'
`;

/** Builds a fresh, in-memory `TopologyFileSource` seeded with the compact tree above. */
export function createTopologySeedSource(): TopologyFileSource {
  return createMemorySource({
    [TOPOLOGY_REF]: TOPOLOGY_YAML,
    '.workspec/resources/client.yaml': CLIENT_RESOURCE_YAML,
    '.workspec/resources/app-service.yaml': APP_SERVICE_RESOURCE_YAML,
    '.workspec/resources/sql.yaml': SQL_RESOURCE_YAML,
    '.workspec/environments/dev.yaml': DEV_ENVIRONMENT_YAML,
    '.workspec/environments/prod.yaml': PROD_ENVIRONMENT_YAML,
  });
}
