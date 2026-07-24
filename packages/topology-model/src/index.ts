/**
 * `@workspec/topology-model`'s browser-safe root entry: everything needed to
 * load a `TopologyModel` from an in-memory tree, resolve it against one
 * environment, and build both lens trees. Nothing here reaches into
 * `node:fs` or any other Node builtin — `FsSource` lives behind the `./fs`
 * subpath export (`import { createFsSource } from '@workspec/topology-model/fs'`)
 * so this entry stays loadable in a worker or browser context that has no
 * `node:` module resolution at all.
 */
export { loadTopologyModel } from './load-topology-model.js';

export type { TopologyFileSource } from './ports/topology-file-source.js';
export { createMemorySource } from './sources/memory-source.js';
export type { MemorySourceSeed } from './sources/memory-source.js';

// ── Loaded model (pre-resolve) ──────────────────────────────────────────────
export type { TopologyModel } from './model/topology-model.types.js';
export type {
  LoadedEnvironment,
  LoadedLayoutInfo,
  LoadedResource,
  LoadedTopology,
} from './model/loaded-artifact.types.js';

// ── Diagnostics ──────────────────────────────────────────────────────────────
export { DIAGNOSTIC_CODES } from './model/diagnostic-codes.js';
export type { TopologyDiagnosticCode } from './model/diagnostic-codes.js';
export type { TopologyDiagnostic, TopologyDiagnosticSeverity } from './model/diagnostic.types.js';

// ── Grouping-kind rule (spec §3.2) ───────────────────────────────────────────
export { GROUPING_KINDS, isGroupingKind, isGroupingKindForLens } from './model/grouping-kind.js';
export type { GroupingKind } from './model/grouping-kind.js';

// ── resolve() — THE NORMATIVE CONTRACT (spec §3.3) ───────────────────────────
export { resolve } from './resolve/resolve-topology.js';
export type {
  ResolvedConnection,
  ResolvedNaming,
  ResolvedResource,
  ResolvedTopology,
} from './model/resolved-topology.types.js';

// ── Lens trees (spec §3.2) ────────────────────────────────────────────────────
export { buildNetworkTree } from './lenses/build-network-tree.js';
export { buildResourceGroupTree } from './lenses/build-resource-group-tree.js';
export type {
  LensContainer,
  LensEntry,
  LensId,
  LensNode,
  LensPosition,
  LensTree,
  LensTreeCounts,
} from './model/lens-tree.types.js';

// ── Per-lens layout position join ────────────────────────────────────────────
export { joinPositionsToLensTree } from './layout-join/join-positions-to-lens-tree.js';
