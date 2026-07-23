// The `report` domain core — shared by the CLI's `report` command
// (`cli.ts`'s `runReport`, which parses `--by`/`--format` and prints) and the
// `cost_report` MCP tool (`mcp-tools/report-tool.ts`). This module owns the
// "exactly one inventory + one attribution in scope, join every spend,
// compute coverage/rollup for one dimension" logic; rendering the result to
// table/json/csv text lives in the sibling `report-render.ts` so both
// surfaces call the same two functions rather than re-deriving either step.

import type { Attribution, CostRepositoryPort, Inventory, Spend } from '@workspec/cost-schema';
import { attribute } from '@workspec/cost-engine';
import type { AttributeResult, Coverage, Rollup } from '@workspec/cost-engine';

/** Diagnostic codes from `attribute()` worth surfacing as report warnings. */
export const REPORT_DIAGNOSTIC_CODES = new Set(['mixed-currency', 'orphan-spend-row']);

/** Inputs a caller has already extracted from its own arg surface. */
export interface ReportParams {
  /** Dimension to roll up by (default: the attribution's primary dimension). */
  readonly by?: string;
}

/** A usage problem — wrong artifact counts, or an unknown `--by` dimension. */
export interface ReportUsageError {
  readonly kind: 'usage-error';
  readonly message: string;
}

/** A read failure for a specific artifact ref — the caller formats it with its own diagnostics style. */
export interface ReportReadError {
  readonly kind: 'read-error';
  readonly ref: string;
  readonly error: unknown;
}

/** An invariant that should never happen (a resolved ref/coverage/rollup came back undefined). */
export interface ReportInternalError {
  readonly kind: 'internal-error';
  readonly message: string;
}

/** The computed report: enough to render any of table/json/csv without re-touching the repository. */
export interface ReportOk {
  readonly kind: 'ok';
  readonly dimensionId: string;
  readonly dimensionLabel: string;
  readonly primaryCoverage: Coverage;
  /** Every dimension's coverage (not just the primary) — the raw subset the "json" format echoes. */
  readonly coverage: readonly Coverage[];
  readonly rollup: Rollup;
  readonly totals: AttributeResult['totals'];
  /** Engine diagnostics worth surfacing (per {@link REPORT_DIAGNOSTIC_CODES}), in report order. */
  readonly warnings: readonly { readonly code: string; readonly message: string }[];
}

export type ReportOutcome = ReportUsageError | ReportReadError | ReportInternalError | ReportOk;

/**
 * Computes the coverage headline + rollup for `params.by` (or the
 * attribution's primary dimension). Requires exactly one inventory and one
 * attribution in `repository`; joins every spend found.
 */
export async function computeReport(
  repository: CostRepositoryPort,
  params: ReportParams,
): Promise<ReportOutcome> {
  const invRefs = await repository.listInventories();
  const attrRefs = await repository.listAttributions();
  if (invRefs.length !== 1) {
    return { kind: 'usage-error', message: `expected exactly 1 inventory, found ${invRefs.length}` };
  }
  if (attrRefs.length !== 1) {
    return { kind: 'usage-error', message: `expected exactly 1 attribution, found ${attrRefs.length}` };
  }
  const invRef = invRefs[0];
  const attrRef = attrRefs[0];
  if (invRef === undefined || attrRef === undefined) {
    return { kind: 'internal-error', message: 'internal error resolving artifact refs' };
  }

  let inventory: Inventory;
  try {
    inventory = await repository.readInventory(invRef.ref);
  } catch (error) {
    return { kind: 'read-error', ref: invRef.ref, error };
  }

  let attribution: Attribution;
  try {
    attribution = await repository.readAttribution(attrRef.ref);
  } catch (error) {
    return { kind: 'read-error', ref: attrRef.ref, error };
  }

  const spendRefs = await repository.listSpends();
  const spends: Spend[] = [];
  for (const { ref } of spendRefs) {
    try {
      spends.push(await repository.readSpend(ref));
    } catch (error) {
      return { kind: 'read-error', ref, error };
    }
  }

  const result: AttributeResult = attribute(inventory, spends, attribution);

  const by = params.by ?? result.primaryDimensionId;
  const dimension = attribution.spec.dimensions.find((d) => d.id === by);
  if (dimension === undefined) {
    return { kind: 'usage-error', message: `unknown dimension "${by}" (not declared in the attribution)` };
  }

  const primaryCoverage = result.coverage.find((c) => c.isPrimary);
  const rollup = result.rollups.find((r) => r.dimensionId === by);
  if (primaryCoverage === undefined || rollup === undefined) {
    return { kind: 'internal-error', message: 'internal error computing coverage/rollup' };
  }

  const warnings = result.diagnostics
    .filter((d) => REPORT_DIAGNOSTIC_CODES.has(d.code))
    .map((d) => ({ code: d.code, message: d.message }));

  return {
    kind: 'ok',
    dimensionId: dimension.id,
    dimensionLabel: dimension.label,
    primaryCoverage,
    coverage: result.coverage,
    rollup,
    totals: result.totals,
    warnings,
  };
}
