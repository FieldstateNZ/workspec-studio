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
 *   `parse-error` (mapped by `parse*Yaml`) and `legacy-environment-overrides`
 *   (also mapped by `parse*Yaml`, from the SAME underlying Zod issue as
 *   `parse-error` — see that code's own doc comment for why it gets a
 *   dedicated code instead), plus the location-tied semantic codes —
 *   `dangling-ref` (a connection `from`/`to` or a resource's
 *   `network`/`resourceGroup` ref, including one named by an override —
 *   S1), `non-grouping-placement`, `dangling-override-environment-ref` and
 *   `override-environment-not-present` (a resource's `spec.overrides` key,
 *   located inside ITS OWN file — S1; BOTH of this feature's integrity rules
 *   live here at the model layer, not schema-level, even though the second
 *   one is file-local — see `checkOverrideEnvironmentRefs`'s doc
 *   comment for why), and `orphan-layout-node` / `orphan-layout-edge-hint`
 *   (the offending pinned entry in the `.layout/` file) — all located via
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
  /**
   * An Environment file's `spec.overrides` — v0's per-resource override map,
   * removed from the schema in S1 — is still present. `EnvironmentSpec`'s
   * `z.object` silently strips unknown keys by default, so WITHOUT this
   * dedicated code the exact same underlying issue would just be a normal
   * `parse-error` an author could easily mistake for cosmetic; a distinct
   * code makes it greppable and lets `validate`/CI treat "there is a legacy
   * block quietly doing nothing" as its own first-class, loudly-reported
   * failure mode rather than one line lost in a `parse-error` list. Carries
   * line/col.
   */
  legacyEnvironmentOverrides: 'legacy-environment-overrides',
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
  /**
   * A resource's `spec.overrides` key names an environment id that isn't one
   * of the owning Topology's declared `spec.environments` (S1) — necessarily
   * model-level, since a standalone Resource file can't see the topology's
   * environment list. See `overrideEnvironmentNotPresent` for the sibling
   * rule (same key, different failure mode) and
   * `checkOverrideEnvironmentRefs`'s doc comment for why BOTH live here
   * rather than one of them being schema-level. Carries line/col + refSlug.
   */
  danglingOverrideEnvironmentRef: 'dangling-override-environment-ref',
  /**
   * A resource's `spec.overrides` key names a real topology environment, but
   * this SAME resource's own `spec.environments` excludes it (S1) — the
   * override targets an environment this resource is never deployed to, so
   * it can never take effect. Self-contained within one Resource file (this
   * check doesn't need the topology at all beyond confirming the env id is
   * real first — see `danglingOverrideEnvironmentRef`), but still model-level
   * rather than a schema `superRefine`: a schema failure would invalidate
   * the whole resource and cascade into spurious diagnostics everywhere else
   * it's referenced (found by S1 adversarial review). Carries line/col + refSlug.
   */
  overrideEnvironmentNotPresent: 'override-environment-not-present',
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
