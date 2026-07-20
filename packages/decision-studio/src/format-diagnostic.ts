import type { ValidateDiagnostic } from './collect-diagnostics.js';

/**
 * Formats one {@link ValidateDiagnostic} as a `file:line:col: severity: message`
 * line, CI-friendly (matching most compilers' diagnostic format), with a
 * trailing newline. Reproduces the CLI's original inline formatting exactly:
 * a missing/zero source line falls back to `1:1`, and a `parse-error`
 * diagnostic's `path` (when present) is appended as `" (path)"`.
 */
export function formatDiagnostic(diagnostic: ValidateDiagnostic): string {
  const loc =
    diagnostic.line !== undefined && diagnostic.line > 0
      ? `${diagnostic.line}:${diagnostic.col}`
      : '1:1';
  const level = diagnostic.severity === 'error' ? 'error' : 'warning';
  const pathSuffix = diagnostic.path !== undefined ? ` (${diagnostic.path})` : '';
  return `${diagnostic.file}:${loc}: ${level}: ${diagnostic.message}${pathSuffix}\n`;
}
