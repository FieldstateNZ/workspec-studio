import type { TopologyDiagnostic } from './model/diagnostic.types.js';
import type { TopologyModel } from './model/topology-model.types.js';
import type { TopologyFileSource } from './ports/topology-file-source.js';
import { authoredConnectionKeys, authoredResourceSlugs } from './layout-join/authored-topology-refs.js';
import { joinLayoutToModel } from './layout-join/join-layout-to-model.js';
import { checkDanglingRefs } from './links/check-dangling-refs.js';
import { loadEnvironmentsRaw } from './loading/load-environments-raw.js';
import { loadLayoutsRaw } from './loading/load-layouts-raw.js';
import { loadResourcesRaw } from './loading/load-resources-raw.js';
import { loadTopologiesRaw } from './loading/load-topologies-raw.js';
import { selectTopology } from './loading/select-topology.js';

/**
 * Loads a full `TopologyModel` from any {@link TopologyFileSource}:
 * discovers every topology/resource/environment/layout file, parses and
 * validates each one, picks the tree's singleton topology, joins its
 * `.layout/` file, and checks every cross-reference for dangling targets.
 *
 * Never throws: every failure mode becomes an entry in the returned model's
 * `diagnostics` array instead, and the model is always data-complete
 * alongside them — an empty tree, a tree with only resources and no
 * topology yet, and a tree full of dangling refs all resolve successfully.
 * Mirrors `@workspec/c4-model`'s `loadC4Model` pipeline shape.
 */
export async function loadTopologyModel(source: TopologyFileSource): Promise<TopologyModel> {
  const diagnostics: TopologyDiagnostic[] = [];

  const [topologiesRaw, resourcesRaw, environmentsRaw, layoutsRaw] = await Promise.all([
    loadTopologiesRaw(source),
    loadResourcesRaw(source),
    loadEnvironmentsRaw(source),
    loadLayoutsRaw(source),
  ]);
  diagnostics.push(...topologiesRaw.diagnostics);
  diagnostics.push(...resourcesRaw.diagnostics);
  diagnostics.push(...environmentsRaw.diagnostics);
  diagnostics.push(...layoutsRaw.diagnostics);

  const { topology, diagnostics: selectDiagnostics } = selectTopology(topologiesRaw.topologies);
  diagnostics.push(...selectDiagnostics);

  diagnostics.push(
    ...(await checkDanglingRefs(source, topology, resourcesRaw.resources, environmentsRaw.environments)),
  );

  const { layout, diagnostics: layoutDiagnostics } = joinLayoutToModel(
    topology?.slug ?? null,
    authoredResourceSlugs(resourcesRaw.resources),
    topology ? authoredConnectionKeys(topology.topology) : new Set(),
    layoutsRaw.layouts,
  );
  diagnostics.push(...layoutDiagnostics);

  return {
    topology,
    resources: resourcesRaw.resources,
    environments: environmentsRaw.environments,
    layout,
    diagnostics,
  };
}
