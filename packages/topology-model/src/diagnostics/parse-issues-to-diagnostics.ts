import type { ParseIssue } from '@workspec/topology-schema';
import { DIAGNOSTIC_CODES } from '../model/diagnostic-codes.js';
import type { TopologyDiagnostic } from '../model/diagnostic.types.js';
import { makeDiagnostic } from './make-diagnostic.js';

/**
 * Converts every `ParseIssue` from a `parse*Yaml` call into a `parse-error`
 * diagnostic for `file`. The Zod issue path (e.g. `"spec.connections.0.from"`),
 * when present, is folded into the message for context —
 * `TopologyDiagnostic` itself has no `path` field, since it isn't part of
 * the public diagnostic shape. Mirrors `@workspec/c4-model`'s
 * `parseIssuesToDiagnostics` exactly.
 */
export function parseIssuesToDiagnostics(
  file: string,
  issues: readonly ParseIssue[],
): TopologyDiagnostic[] {
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
