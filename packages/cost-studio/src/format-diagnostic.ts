// Formats one `ValidateDiagnostic` (from `collect-diagnostics.ts`) as the
// exact stderr line `cli.ts`'s `validate` command has always printed.
// Extracted alongside `collect-diagnostics.ts` so the CLI's printing stays a
// thin, pure formatting step over the shared diagnostics core — mirrors
// `@workspec/decision-studio`'s `format-diagnostic.ts`, adapted to cost's two
// diagnostic shapes (a located schema/read error vs. an unlocated engine
// warning).

import type { ValidateDiagnostic } from './collect-diagnostics.js';

/** Diagnostic codes produced by a failed read (schema violation or I/O error) — always "located" style. */
const READ_ERROR_CODES = new Set(['parse-error', 'read-error']);

/**
 * Renders one diagnostic as `"ref:line:col: error: message (path)"` for a
 * read failure, or `"ref: warning: [code] message"` for an attribution-engine
 * diagnostic (which has no source location to report).
 */
export function formatDiagnostic(diagnostic: ValidateDiagnostic): string {
  if (READ_ERROR_CODES.has(diagnostic.code)) {
    const loc = diagnostic.line !== undefined && diagnostic.line > 0
      ? `${diagnostic.line}:${diagnostic.col ?? 1}`
      : '1:1';
    const path = diagnostic.path !== undefined && diagnostic.path.length > 0 ? ` (${diagnostic.path})` : '';
    return `${diagnostic.file}:${loc}: error: ${diagnostic.message}${path}\n`;
  }
  return `${diagnostic.file}: warning: [${diagnostic.code}] ${diagnostic.message}\n`;
}
