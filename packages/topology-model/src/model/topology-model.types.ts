import type { TopologyDiagnostic } from './diagnostic.types.js';
import type {
  LoadedEnvironment,
  LoadedLayoutInfo,
  LoadedResource,
  LoadedTopology,
} from './loaded-artifact.types.js';

/**
 * The output of `loadTopologyModel`: the tree's singleton topology (if
 * exactly one was found), every resource and environment by slug, the
 * `.layout/` file joined if present, and every diagnostic found along the
 * way. Always resolves — a tree with errors still produces a data-complete
 * `TopologyModel`, so callers decide what to do with the diagnostics (fail a
 * CI check, render inline in an editor, ignore warnings, etc.) rather than
 * this package deciding for them.
 *
 * `topology` is `null` when the tree has zero or more than one
 * `.workspec/topologies/*.yaml` file — see `DIAGNOSTIC_CODES.noTopology` /
 * `.multipleTopologies`. Every downstream consumer (the UI, recon, cost)
 * takes this model's `topology` through `resolve()` before doing anything
 * with it; nothing here is meant to be rendered directly.
 */
export interface TopologyModel {
  readonly topology: LoadedTopology | null;
  readonly resources: ReadonlyMap<string, LoadedResource>;
  readonly environments: ReadonlyMap<string, LoadedEnvironment>;
  readonly layout: LoadedLayoutInfo | null;
  readonly diagnostics: readonly TopologyDiagnostic[];
}
