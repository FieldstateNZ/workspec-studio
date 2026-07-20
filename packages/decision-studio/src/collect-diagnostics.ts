// The diagnostics-collection core shared by the CLI's `validate` command
// (`cli.ts`'s `runValidate`, which formats and prints from the returned
// array) and the `decisions_validate` MCP tool (`mcp-provider.ts`, which
// returns the array as-is). Extracted so both surfaces run exactly the same
// checks — this module does no I/O beyond what `repo` performs, and prints
// nothing itself.

import { readFile } from 'node:fs/promises';
import type { Catalog } from '@workspec/decision-schema';
import { parseCatalogYaml, parseDecisionYaml } from '@workspec/decision-schema';
import { validateRefs } from '@workspec/decision-engine';
import { ArtifactValidationError } from './fs-repository.js';
import type { FsRepository } from './fs-repository.js';
import { collectLeverRefWarnings } from './lever-refs.js';
import { makeLocator } from './locate.js';

/** One machine-readable validate finding — mirrors `@workspec/c4-model`'s `C4Diagnostic` shape. */
export interface ValidateDiagnostic {
  readonly severity: 'error' | 'warning';
  readonly code: string;
  readonly message: string;
  /** Ref (repo-relative path) of the artifact this diagnostic is about. */
  readonly file: string;
  /** 1-based source line inside `file`, when known. */
  readonly line?: number;
  /** 1-based source column, present only alongside `line`. */
  readonly col?: number;
  /**
   * Dotted schema-issue path (e.g. `"spec.schedules.0.pct"`), present only
   * for `parse-error` diagnostics whose underlying Zod issue had a non-empty
   * path. Lets a formatter reproduce the CLI's original `"(path)"` suffix
   * without re-parsing the source.
   */
  readonly path?: string;
}

/** Pushes one `parse-error` diagnostic per issue, carrying `path` only when non-empty. */
function pushParseErrors(
  diagnostics: ValidateDiagnostic[],
  ref: string,
  issues: { path: string; message: string; line: number; col: number }[],
): void {
  for (const issue of issues) {
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
}

/**
 * Validates every catalog and decision `repo` can see: schema parse-errors,
 * dangling authored SKU-line references (fatal), and dangling lever
 * references (non-fatal warnings). Catalogs are validated first and cached,
 * so a decision's ref-check reuses an already-parsed catalog instead of
 * re-reading it.
 *
 * Returns the full diagnostics list in discovery order (catalogs, then
 * decisions) — the same order `runValidate`'s stderr output has always used.
 */
export async function collectDiagnostics(repo: FsRepository): Promise<ValidateDiagnostic[]> {
  const diagnostics: ValidateDiagnostic[] = [];

  const catalogCache = new Map<string, Catalog>();
  for (const { ref } of await repo.listCatalogs()) {
    const parsed = parseCatalogYaml(await readFile(repo.resolve(ref), 'utf8'));
    if (parsed.ok) {
      catalogCache.set(ref, parsed.data);
    } else {
      pushParseErrors(diagnostics, ref, parsed.errors);
    }
  }

  for (const { ref } of await repo.listDecisions()) {
    const text = await readFile(repo.resolve(ref), 'utf8');
    const parsed = parseDecisionYaml(text);
    if (!parsed.ok) {
      pushParseErrors(diagnostics, ref, parsed.errors);
      continue; // an invalid decision cannot be ref-checked
    }

    const decision = parsed.data;
    const catalogRef = repo.resolveCatalogRef(ref, decision);
    let catalog = catalogCache.get(catalogRef);
    if (catalog === undefined) {
      try {
        catalog = await repo.readCatalog(catalogRef);
      } catch (error) {
        const why = error instanceof ArtifactValidationError ? 'is invalid' : 'cannot be read';
        diagnostics.push({
          severity: 'error',
          code: 'dangling-catalog-ref',
          message: `referenced catalog "${catalogRef}" ${why}`,
          file: ref,
          line: 1,
          col: 1,
        });
        continue;
      }
    }

    // Authored SKU-line references — FATAL.
    const refErrors = validateRefs(decision, catalog);
    if (refErrors.length > 0) {
      const locate = makeLocator(text);
      for (const refError of refErrors) {
        const oi = decision.spec.options.findIndex((o) => o.id === refError.optionId);
        const option = oi >= 0 ? decision.spec.options[oi] : undefined;
        const li = option ? option.lines.findIndex((l) => l.id === refError.lineId) : -1;
        const path =
          oi >= 0 && li >= 0
            ? ['spec', 'options', oi, 'lines', li, refError.field]
            : ['spec', 'options'];
        const pos = locate(path);
        diagnostics.push({
          severity: 'error',
          code: `dangling-${refError.field}-ref`,
          message: refError.message,
          file: ref,
          line: pos.line,
          col: pos.col,
        });
      }
    }

    // Lever references — NON-fatal warnings (the engine falls back to PAYG/24×7).
    const warnings = collectLeverRefWarnings(decision, catalog);
    if (warnings.length > 0) {
      const locate = makeLocator(text);
      for (const warning of warnings) {
        const pos = locate(warning.path);
        diagnostics.push({
          severity: 'warning',
          code: `dangling-lever-${warning.field}-ref`,
          message: warning.message,
          file: ref,
          line: pos.line,
          col: pos.col,
        });
      }
    }
  }

  return diagnostics;
}
