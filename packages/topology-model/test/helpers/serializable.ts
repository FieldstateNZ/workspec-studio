import type { TopologyModel } from '../../src/model/topology-model.types.js';

/** Vitest snapshots (and deep-equal assertions) serialise `Map`s awkwardly — flatten `TopologyModel`'s maps to plain objects. */
export function serializableModel(model: TopologyModel): unknown {
  return {
    ...model,
    resources: Object.fromEntries(model.resources),
    environments: Object.fromEntries(model.environments),
  };
}
