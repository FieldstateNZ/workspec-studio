import type { C4Model } from '../../src/model/c4-model.types.js';

/** Vitest snapshots (and deep-equal assertions) serialise `Map`s awkwardly — flatten `elements` to plain objects. */
export function serializableModel(model: C4Model): unknown {
  return {
    ...model,
    elements: Object.fromEntries(
      Object.entries(model.elements).map(([kind, byKind]) => [kind, Object.fromEntries(byKind)]),
    ),
  };
}
