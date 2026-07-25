// Bridges a loaded `TopologyModel` (keyed by `LoadedTopology`/`LoadedResource`/
// `LoadedEnvironment`, each carrying its source `path`/`text` alongside the
// parsed artifact) to `@workspec/topology-model`'s `resolve()` — THE
// NORMATIVE CONTRACT — which takes plain `Topology`/`Resource`/`Environment`
// maps instead. Every server route, CLI command, and MCP tool that needs a
// `ResolvedTopology` for one environment goes through this rather than
// re-deriving the same unwrap-and-call inline at each call site.

import { resolve } from '@workspec/topology-model';
import type { ResolvedTopology, TopologyModel } from '@workspec/topology-model';
import type { Environment, Resource } from '@workspec/topology-schema';

/**
 * Resolves `model`'s topology for `envSlug`, or `undefined` when the tree has
 * no singleton topology to resolve (zero or more than one
 * `.workspec/topologies/*.yaml` file — see `model.diagnostics` for why).
 * `envSlug` itself is not validated against the topology's declared
 * `environments` here — `resolve()` is total for any string, pruning
 * everything when `envSlug` names an environment the topology never
 * declares; that is a legitimate ("all scoped away") empty result, not an
 * error this function raises.
 */
export function resolveModelForEnv(model: TopologyModel, envSlug: string): ResolvedTopology | undefined {
  if (model.topology === null) return undefined;

  const resources = new Map<string, Resource>(
    [...model.resources].map(([slug, loaded]) => [slug, loaded.resource]),
  );
  const environments = new Map<string, Environment>(
    [...model.environments].map(([slug, loaded]) => [slug, loaded.environment]),
  );

  return resolve(model.topology.topology, resources, environments, envSlug);
}
