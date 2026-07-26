import type { Environment, Resource, Topology } from '@workspec/topology-schema';
import type { ResolvedResource, ResolvedTopology } from '../model/resolved-topology.types.js';
import { mergeConfig } from './merge-config.js';
import { mergeCost } from './merge-cost.js';
import { pruneConnections } from './prune-connections.js';
import { pruneResources } from './prune-resources.js';
import { computeResourceGroupNames } from './resource-group-names.js';

function toResolvedResource(slug: string, resource: Resource, envSlug: string): ResolvedResource {
  const { spec } = resource;
  const override = spec.overrides?.[envSlug];

  return {
    slug,
    name: spec.name,
    kind: spec.kind,
    type: spec.type,
    provider: spec.provider,
    network: override?.network ?? spec.network ?? null,
    resourceGroup: override?.resourceGroup ?? spec.resourceGroup ?? null,
    realizes: spec.realizes ?? [],
    config: mergeConfig(spec.config, override?.config),
    cost: mergeCost(spec.cost, override?.cost),
    source: spec.source ?? null,
  };
}

/**
 * Resolves a `Topology` for one environment — THE NORMATIVE CONTRACT (spec
 * §3.3) every downstream consumer (lens trees, recon, cost) takes instead of
 * a raw `Topology`. Applies, in order: (1) prune resources scoped away from
 * `envSlug`; (2) prune connections whose own scope excludes `envSlug` OR
 * whose endpoint was pruned in step 1; (3) merge each surviving resource's
 * OWN per-environment `spec.overrides[envSlug]` patch (S1) onto its
 * `config`/`cost`/`resourceGroup`/`network` — `config` is a shallow,
 * top-level merge (see `mergeConfig`), `cost` is a field-by-field merge (see
 * `mergeCost`), and `resourceGroup`/`network` fully replace the base ref when
 * the override names them; (4) compute naming-suffixed resource-group
 * display names from the matching `Environment`'s `naming` (the ONE thing
 * still sourced from the Environment artifact — see `@workspec/topology-schema`'s
 * `environment.ts` for why overrides moved off of it in S1).
 *
 * Pure and total — never throws, including when `envSlug` names an
 * environment the topology doesn't declare (every scoped resource/connection
 * is then pruned, since none can include an undeclared slug, and no resource
 * carries an override keyed to an undeclared env by construction) or when
 * `environments` has no entry for `envSlug` (naming is simply absent).
 * Diagnosing *whether* `envSlug` and the referenced resources/environment are
 * valid in the first place is `loadTopologyModel`'s job (see `links/`), not
 * this function's — `resolve()` only transforms already-loaded data.
 *
 * `resources`/`environments` are keyed by slug (the same keying
 * `loadTopologyModel` produces), not wrapped in this package's `LoadedX`
 * types — this keeps `resolve()` usable standalone, against plain fixture
 * data, without going through a `TopologyFileSource` at all. `environments`
 * is still a parameter (unchanged signature) — only `naming` is read from it
 * now; overrides come from `resources` alone.
 */
export function resolve(
  topology: Topology,
  resources: ReadonlyMap<string, Resource>,
  environments: ReadonlyMap<string, Environment>,
  envSlug: string,
): ResolvedTopology {
  const survivingResources = pruneResources(resources, envSlug);
  const survivingConnections = pruneConnections(
    topology.spec.connections,
    new Set(survivingResources.keys()),
    envSlug,
  );
  const environment = environments.get(envSlug) ?? null;

  const resolvedResources = [...survivingResources.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([slug, resource]) => toResolvedResource(slug, resource, envSlug));

  return {
    envSlug,
    title: topology.spec.title,
    provider: topology.spec.provider,
    catalog: topology.spec.catalog ?? null,
    resources: resolvedResources,
    connections: survivingConnections.map((connection) => ({
      from: connection.from,
      to: connection.to,
      class: connection.class,
    })),
    naming: { resourceGroupSuffix: environment?.spec.naming?.resourceGroupSuffix ?? null },
    resourceGroupNames: computeResourceGroupNames(
      survivingResources,
      environment?.spec.naming?.resourceGroupSuffix ?? null,
    ),
  };
}
