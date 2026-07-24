import { slugFromPath } from '@workspec/schema-core';
import type { TopologyDiagnosticCode } from '../model/diagnostic-codes.js';
import type { TopologyDiagnostic, TopologyDiagnosticSeverity } from '../model/diagnostic.types.js';

/** A 1-based line/column position inside a diagnostic's `file`. */
export interface DiagnosticPosition {
  readonly line: number;
  readonly col: number;
}

/** Optional context a diagnostic may carry beyond severity/code/message/file. */
export interface DiagnosticExtras {
  /** Source position of the offending entry inside `file` (the location-tied codes). */
  readonly position?: DiagnosticPosition | undefined;
  /** The slug the offending reference points at (`dangling-ref`, `non-grouping-placement`). */
  readonly refSlug?: string | undefined;
}

/**
 * Builds one {@link TopologyDiagnostic}. Every diagnostic about a real
 * `.yaml` file has its `slug` derived here from `file` via `slugFromPath` —
 * callers never set it directly, which keeps the file/slug pairing
 * consistent everywhere a diagnostic is raised. Mirrors
 * `@workspec/c4-model`'s `makeDiagnostic` exactly.
 */
export function makeDiagnostic(
  severity: TopologyDiagnosticSeverity,
  code: TopologyDiagnosticCode,
  message: string,
  file: string,
  extras: DiagnosticExtras = {},
): TopologyDiagnostic {
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
