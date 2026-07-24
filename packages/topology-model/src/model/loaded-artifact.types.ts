import type { Environment, Layout, Resource, Topology } from '@workspec/topology-schema';

/** One successfully parsed `.workspec/topologies/<slug>.yaml` file. */
export interface LoadedTopology {
  readonly slug: string;
  readonly path: string;
  readonly topology: Topology;
  /** The raw YAML source, kept so verify-time diagnostics can locate the offending connection/ref's line. */
  readonly text: string;
}

/** One successfully parsed `.workspec/resources/<slug>.yaml` file. */
export interface LoadedResource {
  readonly slug: string;
  readonly path: string;
  readonly resource: Resource;
  /** The raw YAML source, kept so verify-time diagnostics can locate an offending `network`/`resourceGroup` ref's line. */
  readonly text: string;
}

/** One successfully parsed `.workspec/environments/<slug>.yaml` file. */
export interface LoadedEnvironment {
  readonly slug: string;
  readonly path: string;
  readonly environment: Environment;
}

/** A loaded `.layout/` file, matched to the tree's singleton topology. */
export interface LoadedLayoutInfo {
  readonly path: string;
  readonly data: Layout;
}
