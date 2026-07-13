// Spend joining: sum every spend row onto its inventory resource. Callers
// pre-filter periods (the engine sums whatever rows it is given — it has no
// notion of "the current period").

import type { Inventory, Spend } from '@workspec/cost-schema';
import type { Diagnostic, OrphanSpendRow, Orphans, Totals } from './types.js';

export interface SpendJoin {
  /** Every inventory resource's summed spend (`0` if it has no matching rows). */
  resourceSpend: Record<string, number>;
  totals: Totals;
  orphans: Orphans;
  diagnostics: Diagnostic[];
}

/**
 * Join spend rows onto inventory resources by `resourceId`.
 *
 * - A resource's spend = the sum of every row across every `spendDocs` entry
 *   whose `resourceId` matches it.
 * - A row whose `resourceId` is not a known inventory resource is an orphan:
 *   counted in `totals.orphanSpend` / `orphans`, an `orphan-spend-row`
 *   diagnostic is emitted, and it is excluded from the resource-spend map
 *   (and therefore from every rollup/coverage/cross-tab, which are computed
 *   over `resourceSpend`).
 * - A row marked `unresolved: true` is counted in `totals.unresolvedSpend`
 *   only — it carries no `resourceId` by schema construction, so it cannot
 *   be an orphan, and no diagnostic is emitted for it.
 * - `totals.totalSpend` is the grand total across every row given
 *   (inventory-joined + orphan + unresolved); `totals.inventorySpend` is the
 *   subset joined to inventory resources — the rollup/coverage denominator.
 * - More than one distinct currency across all rows emits one `mixed-currency`
 *   error diagnostic (amounts are still summed numerically regardless — a
 *   documented limitation); `totals.currencies` carries every code seen.
 *
 * Pure: never mutates `inventory` or `spendDocs`.
 */
export function joinSpend(inventory: Inventory, spendDocs: readonly Spend[]): SpendJoin {
  const resourceIds = inventory.spec.resources.map((r) => r.id);
  const resourceSpend: Record<string, number> = {};
  for (const id of resourceIds) resourceSpend[id] = 0;
  const knownIds = new Set(resourceIds);
  const seenIds = new Set<string>();

  let totalSpend = 0;
  let orphanSpend = 0;
  let unresolvedSpend = 0;
  const orphanRows: OrphanSpendRow[] = [];
  const currencies = new Set<string>();
  const diagnostics: Diagnostic[] = [];

  for (const doc of spendDocs) {
    for (const row of doc.spec.rows) {
      totalSpend += row.amount;
      currencies.add(row.currency);

      if (row.unresolved === true) {
        unresolvedSpend += row.amount;
        continue;
      }

      // Schema guarantees resourceId is present when unresolved !== true;
      // this guard is defensive only (never reachable for schema-valid input).
      const resourceId = row.resourceId;
      if (resourceId === undefined) continue;

      if (!knownIds.has(resourceId)) {
        orphanSpend += row.amount;
        orphanRows.push({
          resourceId,
          amount: row.amount,
          currency: row.currency,
          period: row.period,
          serviceCategory: row.serviceCategory,
        });
        diagnostics.push({
          code: 'orphan-spend-row',
          severity: 'warning',
          message: `spend row for unknown resource id "${resourceId}" (not in inventory)`,
          resourceId,
        });
        continue;
      }

      resourceSpend[resourceId] = (resourceSpend[resourceId] ?? 0) + row.amount;
      seenIds.add(resourceId);
    }
  }

  if (currencies.size > 1) {
    diagnostics.push({
      code: 'mixed-currency',
      severity: 'error',
      message: `spend rows use more than one currency: ${[...currencies].sort().join(', ')}`,
    });
  }

  const inventorySpend = resourceIds.reduce((sum, id) => sum + (resourceSpend[id] ?? 0), 0);
  const resourcesWithoutSpend = resourceIds.filter((id) => !seenIds.has(id)).length;

  return {
    resourceSpend,
    totals: {
      totalSpend,
      inventorySpend,
      orphanSpend,
      unresolvedSpend,
      resourcesWithoutSpend,
      currencies: [...currencies].sort(),
    },
    orphans: { rows: orphanRows, totalAmount: orphanSpend },
    diagnostics,
  };
}
