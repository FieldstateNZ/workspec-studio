/**
 * The full public catalogue of diagnostic codes `loadTopologyModel` can
 * emit — one entry per distinct failure mode, and a stable contract
 * consumers may switch on. Never throws for any of these: every failure
 * mode below degrades to an entry in `TopologyModel.diagnostics` instead.
 * Mirrors `@workspec/c4-model`'s `DIAGNOSTIC_CODES` shape.
 *
 * `line`/`col` context — which codes carry a source position, and why:
 *
 * - **Carries line/col** (points at one YAML entry inside `file`):
 *   `parse-error` (mapped by `parse*Yaml`), plus the location-tied semantic
 *   codes — `dangling-ref` (a connection `from`/`to` or a resource's
 *   `network`/`resourceGroup` ref), `non-grouping-placement`, and
 *   `orphan-layout-node` / `orphan-layout-edge-hint` (the offending pinned
 *   entry in the `.layout/` file) — all located via
 *   `@workspec/topology-schema`'s underlying YAML document.
 * - **File-only** (no line/col, by design): `no-topology` /
 *   `multiple-topologies` — the problem is the *count* of
 *   `topologies/*.yaml` files, not any one line; `dangling-environment-ref`
 *   and `dangling-catalog-ref` — the message quotes the exact missing slug
 *   so the offending entry is greppable without a locator; and
 *   `orphan-layout-file` — the whole file is the orphan.
 */
export const DIAGNOSTIC_CODES = {
  /** YAML syntax error or schema-validation failure for one artifact file. Carries line/col. */
  parseError: 'parse-error',
  /** No `.workspec/topologies/*.yaml` file exists in the tree. File-only (no `file` line, since there is no file). */
  noTopology: 'no-topology',
  /** More than one `.workspec/topologies/*.yaml` file exists; the lexicographically-first slug is used as a deterministic fallback. File-only. */
  multipleTopologies: 'multiple-topologies',
  /** A connection `from`/`to`, or a resource's `network`/`resourceGroup`, does not resolve to any resource file. Carries line/col + refSlug. */
  danglingRef: 'dangling-ref',
  /** A resource's `network`/`resourceGroup` ref resolves to a real resource, but that resource's `kind` is not a grouping kind for that lens. Carries line/col + refSlug. */
  nonGroupingPlacement: 'non-grouping-placement',
  /** The topology's `defaultEnvironment` or an `environments[]` entry does not resolve to any environment file. File-only (quotes the missing slug). */
  danglingEnvironmentRef: 'dangling-environment-ref',
  /** The topology's `catalog` ref does not resolve to a `.workspec/catalogs/*.yaml` file. File-only. */
  danglingCatalogRef: 'dangling-catalog-ref',
  /** A `.layout/<slug>.yaml` file exists but no topology artifact has that slug. File-only. */
  orphanLayoutFile: 'orphan-layout-file',
  /** A `.layout/` file pins a resource slug that isn't a resource of the topology. Carries line/col. */
  orphanLayoutNode: 'orphan-layout-node',
  /** A `.layout/` file's edge routing hint key matches no connection of the topology. Carries line/col. */
  orphanLayoutEdgeHint: 'orphan-layout-edge-hint',
} as const;

/** One of the diagnostic codes in {@link DIAGNOSTIC_CODES}. */
export type TopologyDiagnosticCode = (typeof DIAGNOSTIC_CODES)[keyof typeof DIAGNOSTIC_CODES];
