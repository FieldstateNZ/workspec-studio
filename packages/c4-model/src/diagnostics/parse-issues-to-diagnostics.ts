import type { ParseIssue } from '@workspec/c4-schema';
import { DIAGNOSTIC_CODES } from '../model/diagnostic-codes.js';
import type { C4Diagnostic } from '../model/diagnostic.types.js';
import { makeDiagnostic } from './make-diagnostic.js';

/**
 * Converts every `ParseIssue` from a `parse*Yaml` call into a `parse-error`
 * diagnostic for `file`. The Zod issue path (e.g. `"nodes.0.slug"`), when
 * present, is folded into the message for context — `C4Diagnostic` itself
 * has no `path` field, since it isn't part of the public diagnostic shape.
 */
export function parseIssuesToDiagnostics(
  file: string,
  issues: readonly ParseIssue[],
): C4Diagnostic[] {
  return issues.map((issue) =>
    makeDiagnostic(
      'error',
      DIAGNOSTIC_CODES.parseError,
      issue.path ? `${issue.path}: ${issue.message}` : issue.message,
      file,
      { position: { line: issue.line, col: issue.col } },
    ),
  );
}
