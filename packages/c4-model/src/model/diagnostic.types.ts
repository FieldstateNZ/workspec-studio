import type { C4DiagnosticCode } from './diagnostic-codes.js';

/** Whether a diagnostic blocks correct resolution (`error`) or merely flags a smell (`warning`). */
export type C4DiagnosticSeverity = 'error' | 'warning';

/**
 * One finding produced while loading a C4 tree. `loadC4Model` never
 * throws — every problem it finds, from a YAML syntax error to a dangling
 * diagram ref, becomes one of these instead, and the model still loads
 * best-effort alongside them.
 */
export interface C4Diagnostic {
  readonly severity: C4DiagnosticSeverity;
  readonly code: C4DiagnosticCode;
  readonly message: string;
  /** Repo-relative path (POSIX, matching `C4FileSource`) of the file this diagnostic is about. */
  readonly file: string;
  /**
   * 1-based source line inside `file`. Present for `parse-error` and the
   * five location-tied codes (`dangling-ref`, `dangling-edge-ref`,
   * `duplicate-slug`, `orphan-layout-node`, `orphan-layout-edge-hint`) —
   * see `DIAGNOSTIC_CODES`' doc comment for the full carries-line table
   * and the rationale for the file-only codes.
   */
  readonly line?: number;
  /** 1-based source column, present only alongside `line`. */
  readonly col?: number;
  /** The element/diagram slug this diagnostic concerns, derived from `file`. */
  readonly slug?: string;
  /**
   * The slug the offending *reference* points at, for codes about a
   * reference rather than the file itself (`dangling-ref`,
   * `duplicate-slug`). Distinct from `slug`, which always names the file
   * carrying the reference — e.g. a dangling `{container: ghost}` node in
   * `diagrams/ctx.yaml` has `slug: "ctx"` and `refSlug: "ghost"`.
   */
  readonly refSlug?: string;
}
