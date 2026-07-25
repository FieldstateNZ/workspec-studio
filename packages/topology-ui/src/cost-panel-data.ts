// Pure mapping from a `computeTopologyCost()` result to the Cost view's
// SIDE PANEL list content — per-node rows, the intended/committed/
// schedulable totals, and the `byContainer` attribution breakdown. Kept
// separate from `cost-canvas-data.ts` (the canvas's own mapping) so each
// stays an independently testable pure function; `cost-panel.tsx` itself
// stays purely presentational over this module's output.

import type { TopologyCostResult } from '@workspec/topology-cost';
import type { ResolvedTopology } from '@workspec/topology-model';
import { formatMonthly } from './format-money.js';

/** One Cost-panel row: a priced resource's name, formatted amount, pricing mode, and a "idles" tag for a schedulable (non-committed) resource. */
export interface CostRow {
  readonly slug: string;
  readonly name: string;
  readonly committed: boolean;
  readonly formattedMonthly: string;
  readonly idles: boolean;
}

/** One attribution row: a c4 container's slug, formatted monthly total, and whether any share came from the even-split fallback. */
export interface AttributionRow {
  readonly container: string;
  readonly formattedMonthly: string;
  readonly unattributedByDefault: boolean;
}

/** The Cost panel's fully display-ready data, built once per render from a `useCost` result. */
export interface CostPanelData {
  readonly rows: readonly CostRow[];
  readonly totalFormatted: string;
  readonly committedFormatted: string;
  readonly schedulableFormatted: string;
  readonly attribution: readonly AttributionRow[];
  readonly unattributedFormatted: string;
}

/** Builds every display-ready piece the Cost panel and node-detail cost box need from one `TopologyCostResult`. */
export function buildCostPanelData(resolved: ResolvedTopology, cost: TopologyCostResult, currency: string): CostPanelData {
  const nameBySlug = new Map(resolved.resources.map((r) => [r.slug, r.name]));

  const rows: CostRow[] = cost.nodes.map((node) => ({
    slug: node.slug,
    name: nameBySlug.get(node.slug) ?? node.slug,
    committed: node.committed,
    formattedMonthly: formatMonthly(node.monthly, currency),
    idles: !node.committed,
  }));

  const attribution: AttributionRow[] = Object.values(cost.byContainer).map((container) => ({
    container: container.container,
    formattedMonthly: formatMonthly(container.monthly, currency),
    unattributedByDefault: container.unattributedByDefault,
  }));

  return {
    rows,
    totalFormatted: formatMonthly(cost.totals.all, currency),
    committedFormatted: formatMonthly(cost.totals.committed, currency),
    schedulableFormatted: formatMonthly(cost.totals.schedulable, currency),
    attribution,
    unattributedFormatted: formatMonthly(cost.unattributed.monthly, currency),
  };
}
