/**
 * One validation or YAML-syntax problem found while parsing an artifact,
 * mapped back to a line/column in the source text where possible.
 */
export interface ParseIssue {
  /** Dot-joined Zod issue path, e.g. `"spec.options.0.id"`. Empty for YAML syntax errors. */
  readonly path: string;
  /** Human-readable problem description. */
  readonly message: string;
  /** 1-based source line the issue maps to. */
  readonly line: number;
  /** 1-based source column the issue maps to. */
  readonly col: number;
}

/**
 * The outcome of parsing and validating a YAML artifact: either the typed
 * data, or every issue found (YAML syntax errors and/or Zod validation
 * issues), each mapped to a source position.
 */
export type ParseResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly errors: readonly ParseIssue[] };
