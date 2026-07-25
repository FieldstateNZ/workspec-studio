// Loads the read-only, whole-tree `TopologyModel` a served directory
// contains. Every consumer that needs more than one artifact at a time
// (`validate`, `resolve`, `reconcile`, `cost`, `render`) goes through this —
// never through `FsRepository`'s own per-artifact `read*` methods, which
// only ever see one file at a time and know nothing about cross-references.
//
// Delegates entirely to `@workspec/topology-model`'s `loadTopologyModel`
// over the `FsRepository`'s own `createFileSource()` — this module is
// wiring, not a second implementation of tree discovery/parsing.

import { loadTopologyModel } from '@workspec/topology-model';
import type { TopologyModel } from '@workspec/topology-model';
import type { FsRepository } from './fs-repository.js';

/** Loads the full `TopologyModel` for the tree `repo` is rooted at. Never throws — see `loadTopologyModel`'s own doc comment. */
export function loadAuthoredModel(repo: FsRepository): Promise<TopologyModel> {
  return loadTopologyModel(repo.createFileSource());
}
