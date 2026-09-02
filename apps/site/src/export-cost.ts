// "Export CSV" — the workbench bar's action (mirrors Decisions' "Export ADR"
// pattern: read the CURRENT state through the repository port, render it,
// download it). Builds the same "spend by primary dimension" rollup
// `@workspec/cost-ui`'s own Reports view renders and lets you download from
// inside that tab — this is the equivalent action surfaced at the shared
// workbench-bar level, so it's reachable from every tab, not just Reports.
import { attribute } from '@workspec/cost-engine';
import type { CostRepositoryPort, Ref } from '@workspec/cost-schema';

const MIN_ROW_AMOUNT = 0.5;

/** Build a CSV of "spend by primary dimension" for the attribution at `attributionRef`. */
export async function buildCostReportCsv(
  repository: CostRepositoryPort,
  inventoryRef: Ref,
  attributionRef: Ref,
): Promise<{ filename: string; csv: string }> {
  const [inventory, attribution, spendRefs] = await Promise.all([
    repository.readInventory(inventoryRef),
    repository.readAttribution(attributionRef),
    repository.listSpends(),
  ]);
  const spends = await Promise.all(spendRefs.map((ref) => repository.readSpend(ref.ref)));

  const result = attribute(inventory, spends, attribution);
  const primaryDimension = attribution.spec.dimensions[0];
  if (primaryDimension === undefined) {
    throw new Error(`buildCostReportCsv: attribution "${attributionRef}" declares no dimensions`);
  }
  const primaryRollup = result.rollups.find((r) => r.dimensionId === primaryDimension.id);
  const rows = (primaryRollup?.buckets ?? [])
    .filter((b) => Math.abs(b.amount) >= MIN_ROW_AMOUNT)
    .map((b) => ({
      key: b.key,
      amount: b.amount,
      share:
        result.totals.inventorySpend === 0 ? 0 : (b.amount / result.totals.inventorySpend) * 100,
    }))
    .sort((a, b) => {
      if (a.key === 'unattributed') return 1;
      if (b.key === 'unattributed') return -1;
      return b.amount - a.amount;
    });

  const header = [primaryDimension.label, 'amount', 'share'];
  const lines = [
    header.join(','),
    ...rows.map((r) => [r.key, r.amount.toFixed(2), r.share.toFixed(1)].join(',')),
  ];
  return {
    filename: `${attribution.metadata.slug ?? primaryDimension.id}.cost-report.csv`,
    csv: lines.join('\n'),
  };
}

/** Trigger a browser download of `csv` as `filename` (no server round-trip). */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke on a later tick: some browsers cancel an in-flight download if the
  // blob URL is revoked synchronously right after click().
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
