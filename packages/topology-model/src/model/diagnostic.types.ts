import type { TopologyDiagnosticCode } from './diagnostic-codes.js';

/** Whether a diagnostic blocks correct resolution (`error`) or merely flags a smell (`warning`). */
export type TopologyDiagnosticSeverity = 'error' | 'warning';

/**
 * One finding produced while loading a Topology tree. `loadTopologyModel`
 * never throws — every problem it finds, from a YAML syntax error to a
 * dangling connection ref, becomes one of these instead, and the model
 * still loads best-effort alongside them. Mirrors `@workspec/c4-model`'s
 * `C4Diagnostic` shape exactly.
 */
export interface TopologyDiagnostic {
  readonly severity: TopologyDiagnosticSeverity;
  readonly code: TopologyDiagnosticCode;
  readonly message: string;
  /** Repo-relative path (POSIX, matching `TopologyFileSource`) of the file this diagnostic is about, or `''` for the file-count codes that name no single file. */
  readonly file: string;
  /**
   * 1-based source line inside `file`. Present for `parse-error` and the
   * location-tied codes — see `DIAGNOSTIC_CODES`'s doc comment for the full
   * carries-line table.
   */
  readonly line?: number;
  /** 1-based source column, present only alongside `line`. */
  readonly col?: number;
  /** The artifact slug this diagnostic concerns, derived from `file`. */
  readonly slug?: string;
  /**
   * The slug the offending *reference* points at, for codes about a
   * reference rather than the file itself (`dangling-ref`,
   * `non-grouping-placement`). Distinct from `slug`, which always names the
   * file carrying the reference.
   */
  readonly refSlug?: string;
}
