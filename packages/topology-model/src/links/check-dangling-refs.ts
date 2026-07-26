import type { TopologyDiagnostic } from '../model/diagnostic.types.js';
import type {
  LoadedEnvironment,
  LoadedResource,
  LoadedTopology,
} from '../model/loaded-artifact.types.js';
import type { TopologyFileSource } from '../ports/topology-file-source.js';
import { checkDanglingCatalogRef } from './check-dangling-catalog-ref.js';
import { checkDanglingConnectionRefs } from './check-dangling-connection-refs.js';
import { checkDanglingEnvironmentRefs } from './check-dangling-environment-refs.js';
import { checkDanglingPlacementRefs } from './check-dangling-placement-refs.js';
import { checkOverrideEnvironmentRefs } from './check-override-environment-refs.js';

/**
 * Runs every verify-time cross-reference check `loadTopologyModel` performs:
 * connection endpoints, resource placement refs (including override
 * `resourceGroup`/`network` values — S1), resource override env keys (both
 * integrity rules — S1), the topology's declared environments, and its
 * optional catalog ref. The placement check runs regardless of whether a
 * singleton topology was found (a resource's `network`/`resourceGroup` ref
 * is a resource-to-resource concern, independent of the topology file); the
 * other three are skipped when `topology` is `null` — there's nothing to
 * check a ref *from* (or, for overrides, a `spec.environments` list to check
 * *against*) without one.
 */
export async function checkDanglingRefs(
  source: TopologyFileSource,
  topology: LoadedTopology | null,
  resources: ReadonlyMap<string, LoadedResource>,
  environments: ReadonlyMap<string, LoadedEnvironment>,
): Promise<readonly TopologyDiagnostic[]> {
  const diagnostics: TopologyDiagnostic[] = [...checkDanglingPlacementRefs(resources)];

  if (topology) {
    diagnostics.push(...checkDanglingConnectionRefs(topology, resources));
    diagnostics.push(...checkOverrideEnvironmentRefs(topology, resources));
    diagnostics.push(...checkDanglingEnvironmentRefs(topology, environments));
    diagnostics.push(...(await checkDanglingCatalogRef(source, topology)));
  }

  return diagnostics;
}
