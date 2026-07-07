import { slugFromPath } from '@workspec/c4-schema';
import type { C4DiagnosticCode } from '../model/diagnostic-codes.js';
import type { C4Diagnostic, C4DiagnosticSeverity } from '../model/diagnostic.types.js';

/** A 1-based line/column position inside a diagnostic's `file`. */
export interface DiagnosticPosition {
  readonly line: number;
  readonly col: number;
}

/** Optional context a diagnostic may carry beyond severity/code/message/file. */
export interface DiagnosticExtras {
  /** Source position of the offending entry inside `file` (the location-tied codes). */
  readonly position?: DiagnosticPosition | undefined;
  /** The slug the offending reference points at (`dangling-ref`, `duplicate-slug`). */
  readonly refSlug?: string | undefined;
}

/**
 * Builds one {@link C4Diagnostic}. Every diagnostic in this package is
 * about a real `.yaml` file, so `slug` is always derived here from `file`
 * via `slugFromPath` — callers never set it directly, which keeps the
 * file/slug pairing consistent everywhere a diagnostic is raised.
 */
export function makeDiagnostic(
  severity: C4DiagnosticSeverity,
  code: C4DiagnosticCode,
  message: string,
  file: string,
  extras: DiagnosticExtras = {},
): C4Diagnostic {
  const slug = slugFromPath(file);
  return {
    severity,
    code,
    message,
    file,
    ...(extras.position ? { line: extras.position.line, col: extras.position.col } : {}),
    ...(slug ? { slug } : {}),
    ...(extras.refSlug !== undefined ? { refSlug: extras.refSlug } : {}),
  };
}
