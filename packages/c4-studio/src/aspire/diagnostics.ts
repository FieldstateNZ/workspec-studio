/**
 * The full catalog of `import-aspire --mode check` drift codes. Mirrors
 * `@workspec/c4-model`'s `DIAGNOSTIC_CODES` pattern (a `const` object plus a
 * derived union type) but is its own, separate vocabulary — this describes
 * drift between the Aspire graph and the tree, not tree-internal problems
 * (those are `workspec-c4 validate`'s job).
 */
export const ASPIRE_DIAGNOSTIC_CODES = {
  /** A desired element (from a mapped, non-parameter resource) has no file on disk yet. */
  elementMissing: 'element-missing',
  /** An on-disk element carries the `aspire-managed` tag but no resource in the graph maps to it anymore. */
  elementOrphaned: 'element-orphaned',
  /** A desired edge (from a resolvable `references` entry) is absent from the generated diagram. */
  edgeMissing: 'edge-missing',
  /** An edge in the generated diagram no longer corresponds to any reference in the graph. */
  edgeOrphaned: 'edge-orphaned',
  /** A governed element's (or edge's) field differs between the graph-desired value and what's on disk. */
  fieldDrift: 'field-drift',
} as const;

/** One of the five `import-aspire --mode check` diagnostic codes. */
export type AspireDiagnosticCode =
  (typeof ASPIRE_DIAGNOSTIC_CODES)[keyof typeof ASPIRE_DIAGNOSTIC_CODES];

/**
 * One `import-aspire --mode check` finding. Shaped like
 * `@workspec/c4-model`'s `C4Diagnostic` (same field names/semantics) so
 * `--json` output is consistent across every `workspec-c4` subcommand, but
 * is its own type — the code vocabulary is different, and `check` never
 * locates a finding to a YAML line/column the way tree-validation does.
 */
export interface AspireDiagnostic {
  readonly severity: 'error' | 'warning';
  readonly code: AspireDiagnosticCode;
  readonly message: string;
  /** Repo-relative path of the file this finding is about. */
  readonly file: string;
  readonly line?: number;
  readonly col?: number;
  /** The element/diagram slug this finding concerns, when applicable. */
  readonly slug?: string;
}
