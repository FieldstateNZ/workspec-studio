import type { Topology } from '@workspec/topology-schema';
import type { LoadedResource } from '../model/loaded-artifact.types.js';

/**
 * Every resource slug the tree actually has a file for — what a `.layout/`
 * file's `nodes` map may legitimately pin a position under. Used by the
 * orphan-layout-node check: a pinned slug naming a resource that doesn't
 * exist (renamed or removed out from under the layout file) is rename-drift.
 */
export function authoredResourceSlugs(resources: ReadonlyMap<string, LoadedResource>): ReadonlySet<string> {
  return new Set(resources.keys());
}

/**
 * Every connection's raw `from`/`to`, as `"<from>-><to>"` — the same key
 * format `.layout/` edge hints use. Built from the topology's own authored
 * `spec.connections`, unresolved and un-pruned (layout files aren't
 * environment-scoped, so orphan checks run against every declared
 * connection regardless of which environment later prunes it).
 */
export function authoredConnectionKeys(topology: Topology): ReadonlySet<string> {
  return new Set(topology.spec.connections.map((connection) => `${connection.from}->${connection.to}`));
}
