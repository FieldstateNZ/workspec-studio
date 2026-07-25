import type { LoadedTopology } from '../../src/model/loaded-artifact.types.js';
import type { TopologyModel } from '../../src/model/topology-model.types.js';

/**
 * Narrows `model.topology` to non-null for golden tests that already assert
 * (elsewhere) that the fixture loads a singleton topology — avoids a
 * `!`-non-null-assertion (banned by this repo's ESLint config) at every
 * call site that needs `model.topology.topology`.
 */
export function requireTopology(model: TopologyModel): LoadedTopology {
  if (!model.topology) {
    throw new Error('expected the fixture tree to load a singleton topology');
  }
  return model.topology;
}
