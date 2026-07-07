/**
 * The full public catalogue of diagnostic codes `loadC4Model` can emit —
 * one entry per distinct failure mode, and a stable contract consumers may
 * switch on. Never throws for any of these: every failure mode below
 * degrades to an entry in `C4Model.diagnostics` instead.
 *
 * `line`/`col` context — which codes carry a source position, and why:
 *
 * - **Carries line/col** (points at one YAML entry inside `file`):
 *   `parse-error` (mapped by `parseYamlArtifact`), plus the five
 *   location-tied semantic codes — `dangling-ref`, `dangling-edge-ref`,
 *   `duplicate-slug` (the offending node/edge entry in the diagram file)
 *   and `orphan-layout-node`, `orphan-layout-edge-hint` (the offending
 *   pinned entry in the `.layout/` file), all located via
 *   `@workspec/c4-schema`'s `locateYamlPath`. Line may be absent only in
 *   the degenerate case where the already-parsed source can't be
 *   re-located (never observed in practice).
 * - **File-only** (no line/col, by design): `no-system` — the problem is
 *   the *absence* of a `system/*.yaml` file, not any one line of the
 *   diagram; `dangling-link` and `link-cycle` — the problem is a missing
 *   target file / a cross-file cycle, and the message quotes the exact
 *   `~/` target(s) so the offending entry is greppable;
 *   `unknown-category` — the category string may appear on many edges and
 *   the real fix usually lives in `spec.yaml`, not the diagram; and
 *   `orphan-layout-file` — the whole file is the orphan.
 */
export const DIAGNOSTIC_CODES = {
  /** YAML syntax error or schema-validation failure for one artifact file. Carries line/col. */
  parseError: 'parse-error',
  /** A bare (untyped) diagram node/edge slug exists as a filename in more than one element kind. Carries line/col + refSlug. */
  duplicateSlug: 'duplicate-slug',
  /** A diagram uses the `__system__` alias but the tree has no `system/*.yaml` file. File-only. */
  noSystem: 'no-system',
  /** A diagram node reference (bare or typed) does not resolve to any element file. Carries line/col + refSlug. */
  danglingRef: 'dangling-ref',
  /** A diagram edge's `from`/`to` does not resolve to a node present in that diagram. Carries line/col. */
  danglingEdgeRef: 'dangling-edge-ref',
  /** An edge's `category` is neither a built-in default nor a key in `spec.yaml`'s `connections`. File-only. */
  unknownCategory: 'unknown-category',
  /** An element's `~/`-rooted `links` entry does not resolve to an existing file in the tree. File-only. */
  danglingLink: 'dangling-link',
  /** A cycle exists among elements' `~/` links to one another. File-only. */
  linkCycle: 'link-cycle',
  /** A `.layout/<slug>.yaml` file exists but no diagram artifact has that slug. File-only. */
  orphanLayoutFile: 'orphan-layout-file',
  /** A `.layout/` file pins a node slug that isn't a node of its diagram. Carries line/col. */
  orphanLayoutNode: 'orphan-layout-node',
  /** A `.layout/` file's edge routing hint key matches no edge of its diagram. Carries line/col. */
  orphanLayoutEdgeHint: 'orphan-layout-edge-hint',
} as const;

/** One of the diagnostic codes in {@link DIAGNOSTIC_CODES}. */
export type C4DiagnosticCode = (typeof DIAGNOSTIC_CODES)[keyof typeof DIAGNOSTIC_CODES];
