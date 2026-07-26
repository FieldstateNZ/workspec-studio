import { LEGACY_ENVIRONMENT_OVERRIDES_ISSUE_CODE } from '@workspec/topology-schema';
import type { ParseIssue } from '@workspec/topology-schema';
import { DIAGNOSTIC_CODES } from '../model/diagnostic-codes.js';
import type { TopologyDiagnosticCode } from '../model/diagnostic-codes.js';
import type { TopologyDiagnostic } from '../model/diagnostic.types.js';
import { makeDiagnostic } from './make-diagnostic.js';

/**
 * Most `ParseIssue`s are ordinary schema-validation failures and map onto
 * the generic `parse-error` code; a small, explicit set of `issue.code`
 * values (stamped by a `params.code`-carrying custom Zod issue — see
 * `@workspec/topology-schema`'s `ParseIssue.code` doc comment) map onto their
 * own dedicated diagnostic code instead, so a consumer can grep/switch on
 * that ONE failure mode without string-matching the message.
 */
function diagnosticCodeFor(issue: ParseIssue): TopologyDiagnosticCode {
  if (issue.code === LEGACY_ENVIRONMENT_OVERRIDES_ISSUE_CODE) {
    return DIAGNOSTIC_CODES.legacyEnvironmentOverrides;
  }
  return DIAGNOSTIC_CODES.parseError;
}

/**
 * Converts every `ParseIssue` from a `parse*Yaml` call into a diagnostic for
 * `file` — `parse-error` for an ordinary schema-validation failure, or one of
 * a small set of dedicated codes for the few issues stamped with a
 * distinguishing `code` (see {@link diagnosticCodeFor}). The Zod issue path
 * (e.g. `"spec.connections.0.from"`), when present, is folded into the
 * message for context — `TopologyDiagnostic` itself has no `path` field,
 * since it isn't part of the public diagnostic shape. Mirrors
 * `@workspec/c4-model`'s `parseIssuesToDiagnostics` shape.
 */
export function parseIssuesToDiagnostics(
  file: string,
  issues: readonly ParseIssue[],
): TopologyDiagnostic[] {
  return issues.map((issue) =>
    makeDiagnostic(
      'error',
      diagnosticCodeFor(issue),
      issue.path ? `${issue.path}: ${issue.message}` : issue.message,
      file,
      { position: { line: issue.line, col: issue.col } },
    ),
  );
}
