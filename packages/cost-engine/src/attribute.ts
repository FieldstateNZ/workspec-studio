// The full attribution result: resolution + spend joining + coverage +
// rollups + cross-tabs, in one call. Designed so a consuming UI (the C5
// workbench) can drive entirely off this one result.

import type { Attribution, Inventory, Spend } from '@workspec/cost-schema';
import { resolveAttribution } from './resolve.js';
import { joinSpend } from './spend-join.js';
import { computeCoverage, crossTab, rollupBy } from './rollup.js';
import type { AttributeResult } from './types.js';

/**
 * Resolve `inventory` against `attribution`, join `spendDocs` onto it, and
 * precompute coverage, rollups (one per declared dimension) and cross-tabs
 * (primary × every other dimension) over the result. Use `crossTab()`
 * directly for any dimension pair not already precomputed here.
 *
 * Pure: never mutates `inventory`, `spendDocs`, or `attribution`.
 */
export function attribute(
  inventory: Inventory,
  spendDocs: readonly Spend[],
  attribution: Attribution,
): AttributeResult {
  const {
    resolutions,
    ruleStats,
    diagnostics: resolutionDiagnostics,
  } = resolveAttribution(inventory, attribution);
  const { resourceSpend, totals, orphans, diagnostics: spendDiagnostics } = joinSpend(inventory, spendDocs);

  const dimensions = attribution.spec.dimensions;
  const primaryDimension = dimensions[0];
  // Unreachable for a schema-valid Attribution: `dimensions` is `.min(1)`.
  if (primaryDimension === undefined) {
    throw new Error('attribute: attribution.spec.dimensions must declare at least one dimension');
  }
  const primaryDimensionId = primaryDimension.id;

  const coverage = dimensions.map((d) =>
    computeCoverage(resolutions, resourceSpend, d.id, d.id === primaryDimensionId),
  );
  const rollups = dimensions.map((d) => rollupBy(resolutions, resourceSpend, d.id));
  const crossTabs = dimensions
    .filter((d) => d.id !== primaryDimensionId)
    .map((d) => crossTab(resolutions, resourceSpend, primaryDimensionId, d.id));

  return {
    resolutions,
    ruleStats,
    resourceSpend,
    coverage,
    primaryDimensionId,
    rollups,
    crossTabs,
    totals,
    orphans,
    diagnostics: [...resolutionDiagnostics, ...spendDiagnostics],
  };
}
