// The diagnostics-collection core shared by the CLI's `validate` command
// (`cli.ts`'s `runValidate`, which formats and prints from the returned
// array via `format-diagnostic.ts`) and the `cost_validate` MCP tool
// (`mcp-tools/validate-tool.ts`, which returns the array as-is). Extracted
// so both surfaces run exactly the same checks — this module does no
// printing itself, only reads through `repository`.
//
// Mirrors `@workspec/decision-studio`'s `collect-diagnostics.ts`, adapted to
// cost-studio's four artifact kinds and its own attribution-engine warnings
// (rather than decision's dangling-ref checks).

import type { Attribution, CostRepositoryPort, Inventory, Spend } from '@workspec/cost-schema';
import { attribute } from '@workspec/cost-engine';
import { ArtifactValidationError } from './fs-repository.js';

/** One machine-readable validate finding — mirrors `@workspec/c4-model`'s `C4Diagnostic` shape. */
export interface ValidateDiagnostic {
  readonly severity: 'error' | 'warning';
  readonly code: string;
  readonly message: string;
  /** Ref (repo-relative path) of the artifact this diagnostic is about. */
  readonly file: string;
  /** 1-based source line inside `file`, when known (cost-schema issues never carry a real line). */
  readonly line?: number;
  /** 1-based source column, present only alongside `line`. */
  readonly col?: number;
  /**
   * Dotted schema-issue path (e.g. `"spec.resources.0.id"`), present only for
   * `parse-error` diagnostics whose underlying issue had a non-empty path.
   */
  readonly path?: string;
}

/** Pushes one diagnostic per read failure: `parse-error` per Zod issue, or a single `read-error`. */
function pushReadError(diagnostics: ValidateDiagnostic[], ref: string, error: unknown): void {
  if (error instanceof ArtifactValidationError) {
    for (const issue of error.issues) {
      diagnostics.push({
        severity: 'error',
        code: 'parse-error',
        message: issue.message,
        file: ref,
        line: issue.line,
        col: issue.col,
        ...(issue.path.length > 0 ? { path: issue.path } : {}),
      });
    }
    return;
  }
  diagnostics.push({
    severity: 'error',
    code: 'read-error',
    message: (error as Error).message,
    file: ref,
    line: 1,
    col: 1,
  });
}

/**
 * Validates every cost artifact `repository` can see: schema parse/read
 * errors across all four kinds (fatal), plus — when at least one inventory
 * and one attribution both parse — the attribution engine's own diagnostics
 * (mixed-currency, orphan-spend, etc.), run over every (inventory,
 * attribution) pairing and reported as non-fatal warnings.
 *
 * Returns the full diagnostics list in discovery order (inventories, spends,
 * attributions, tag plans, then engine warnings) — the same order
 * `runValidate`'s stderr output has always used.
 */
export async function collectDiagnostics(repository: CostRepositoryPort): Promise<ValidateDiagnostic[]> {
  const diagnostics: ValidateDiagnostic[] = [];

  const validInventories: { ref: string; data: Inventory }[] = [];
  for (const { ref } of await repository.listInventories()) {
    try {
      validInventories.push({ ref, data: await repository.readInventory(ref) });
    } catch (error) {
      pushReadError(diagnostics, ref, error);
    }
  }

  const validSpends: Spend[] = [];
  for (const { ref } of await repository.listSpends()) {
    try {
      validSpends.push(await repository.readSpend(ref));
    } catch (error) {
      pushReadError(diagnostics, ref, error);
    }
  }

  const validAttributions: { ref: string; data: Attribution }[] = [];
  for (const { ref } of await repository.listAttributions()) {
    try {
      validAttributions.push({ ref, data: await repository.readAttribution(ref) });
    } catch (error) {
      pushReadError(diagnostics, ref, error);
    }
  }

  for (const { ref } of await repository.listTagPlans()) {
    try {
      await repository.readTagPlan(ref);
    } catch (error) {
      pushReadError(diagnostics, ref, error);
    }
  }

  if (validInventories.length >= 1 && validAttributions.length >= 1) {
    for (const inv of validInventories) {
      for (const attr of validAttributions) {
        const result = attribute(inv.data, validSpends, attr.data);
        const suffix = validInventories.length > 1 ? ` (inventory: ${inv.ref})` : '';
        for (const diagnostic of result.diagnostics) {
          diagnostics.push({
            severity: 'warning',
            code: diagnostic.code,
            message: `${diagnostic.message}${suffix}`,
            file: attr.ref,
          });
        }
      }
    }
  }

  return diagnostics;
}
