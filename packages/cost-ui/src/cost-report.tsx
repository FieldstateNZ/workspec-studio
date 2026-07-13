// Cost · Reports — three stat cards, a spend-by-(primary dimension) bar
// list, and a primary × second-dimension cross-tab, all computed from ONE
// `attribute()` call over the SAME `disabledRuleIds` the Attribution tab is
// currently using (passed down by `CostApp`), so toggling a rule there is
// immediately visible here too ("live against the rule set").

import { useMemo } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import type { Ref } from '@workspec/cost-schema';
import { attribute } from '@workspec/cost-engine';
import { useCostArtifacts } from './context.js';
import {
  chipAccentFor,
  filterEnabledRules,
  formatMoney,
  formatPercent,
  formatPeriodLabel,
} from './format.js';

export interface CostReportProps {
  inventoryRef: Ref;
  attributionRef: Ref;
  /** Rule ids currently toggled off in the Attribution tab — keeps this view "live against the rule set". */
  disabledRuleIds?: string[];
  /** Called when "Fix in workbench →" is clicked; `CostApp` uses this to jump to Attribution in unattributed-filter mode. */
  onFixCoverage?: () => void;
}

const MIN_ROW_AMOUNT = 0.5;
const MIN_COLUMN_AMOUNT = 0.5;

function downloadCsv(filename: string, header: readonly string[], rows: readonly (readonly (string | number)[])[]): void {
  try {
    const lines = [header.join(','), ...rows.map((row) => row.join(','))];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch {
    // Best-effort: some environments (older jsdom, sandboxed webviews) don't
    // implement Blob URLs. The report still renders; only the download fails.
  }
}

export function CostReport(props: CostReportProps): ReactElement {
  const { inventoryRef, attributionRef, disabledRuleIds = [], onFixCoverage } = props;
  const { inventory, attribution, spends, isPending, isError, error } = useCostArtifacts(
    inventoryRef,
    attributionRef,
  );

  const result = useMemo(() => {
    if (!inventory || !attribution || !spends) return undefined;
    const liveRules = filterEnabledRules(attribution.spec.rules, disabledRuleIds);
    return attribute(inventory, spends, { ...attribution, spec: { ...attribution.spec, rules: liveRules } });
  }, [inventory, attribution, spends, disabledRuleIds]);

  const primaryDimension = attribution?.spec.dimensions[0];
  const secondDimension = attribution?.spec.dimensions[1];
  const costTypeDimension = attribution?.spec.dimensions.find((d) => d.id === 'costType');
  const primaryCoverage = result?.coverage.find((c) => c.isPrimary);
  const primaryRollup = result?.rollups.find((r) => r.dimensionId === primaryDimension?.id);
  const costTypeRollup = result?.rollups.find((r) => r.dimensionId === 'costType');
  const crossTab = result?.crossTabs[0];

  const periodLabel = formatPeriodLabel(spends?.[0]?.spec.rows[0]?.period);

  const productRows = useMemo(() => {
    if (!primaryRollup || !result) return [];
    const rows = primaryRollup.buckets
      .filter((b) => Math.abs(b.amount) >= MIN_ROW_AMOUNT)
      .map((b) => ({
        key: b.key,
        amount: b.amount,
        share: result.totals.inventorySpend === 0 ? 0 : (b.amount / result.totals.inventorySpend) * 100,
      }));
    return rows;
  }, [primaryRollup, result]);

  const maxProductAmount = productRows.reduce((max, r) => Math.max(max, Math.abs(r.amount)), 0);

  const capexAmount = costTypeRollup?.buckets.find((b) => b.key === 'capex')?.amount ?? 0;
  const opexAmount = (costTypeRollup?.buckets ?? [])
    .filter((b) => b.key !== 'capex')
    .reduce((sum, b) => sum + b.amount, 0);
  const capexOpexTotal = capexAmount + opexAmount;

  const crossTabColKeys = useMemo(() => {
    if (!crossTab || !secondDimension) return [];
    const hasUnattributedColumn = crossTab.cells.some(
      (c) => c.colKey === 'unattributed' && Math.abs(c.amount) >= MIN_COLUMN_AMOUNT,
    );
    return hasUnattributedColumn ? [...secondDimension.values, 'unattributed'] : [...secondDimension.values];
  }, [crossTab, secondDimension]);

  const crossTabRows = useMemo(() => {
    if (!crossTab || !primaryDimension) return [];
    const rowKeys = [...primaryDimension.values, 'unattributed'];
    return rowKeys.map((rowKey) => {
      const cells = crossTabColKeys.map((colKey) => {
        const cell = crossTab.cells.find((c) => c.rowKey === rowKey && c.colKey === colKey);
        return cell?.amount ?? 0;
      });
      const total = cells.reduce((sum, v) => sum + v, 0);
      return { rowKey, cells, total };
    });
  }, [crossTab, primaryDimension, crossTabColKeys]);

  if (isPending) return <div className="cost-notice">Loading report…</div>;
  if (isError) return <div className="cost-notice cost-notice-error">{`Could not load: ${error?.message ?? 'unknown error'}`}</div>;
  if (!inventory || !attribution || !result || !primaryDimension) {
    return <div className="cost-notice cost-notice-error">Attribution artifact not found.</div>;
  }

  const resourceGroupCount = new Set(inventory.spec.resources.map((r) => r.resourceGroup)).size;

  return (
    <div className="cost-report">
      <div className="cost-report-header">
        <span className="cost-report-header-label">Rollups</span>
        <span className="cost-report-header-hairline" />
        <span className="cost-report-header-meta">{`${periodLabel} · monthly · live against the rule set`}</span>
        <button
          type="button"
          className="cost-btn-ghost"
          onClick={() =>
            downloadCsv(
              'cost-report.csv',
              [primaryDimension.label, 'amount', 'share'],
              productRows.map((r) => [r.key, r.amount.toFixed(2), r.share.toFixed(1)]),
            )
          }
        >
          Export CSV
        </button>
      </div>

      <div className="cost-stat-cards">
        <div className="cost-stat-card">
          <span className="cost-stat-eyebrow">Total spend</span>
          <span className="cost-stat-figure">{formatMoney(result.totals.inventorySpend)}</span>
          <span className="cost-stat-sub">{`${inventory.spec.resources.length} resources · ${resourceGroupCount} resource groups`}</span>
        </div>

        <div className="cost-stat-card cost-stat-card--danger">
          <span className="cost-stat-eyebrow cost-stat-eyebrow--danger">Unattributed</span>
          <span className="cost-stat-figure">{formatMoney(primaryCoverage?.unattributedSpend ?? 0)}</span>
          <span className="cost-stat-sub">{`${primaryCoverage?.unattributedCount ?? 0} resources`}</span>
          <button type="button" className="cost-btn-solid cost-fix-in-workbench-btn" onClick={onFixCoverage}>
            Fix in workbench →
          </button>
        </div>

        {costTypeDimension && (
          <div className="cost-stat-card">
            <span className="cost-stat-eyebrow">Capex / Opex</span>
            <div className="cost-stat-pair">
              <span className="cost-stat-figure-sm" style={{ '--chip-accent': 'var(--el-class)' } as CSSProperties}>
                {formatMoney(capexAmount)}
              </span>
              <span className="cost-stat-figure-sm">{formatMoney(opexAmount)}</span>
            </div>
            <div className="cost-ratio-track">
              <div
                className="cost-ratio-fill-capex"
                style={{ width: capexOpexTotal === 0 ? '0%' : `${(capexAmount / capexOpexTotal) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="cost-report-card">
        <div className="cost-report-card-header">
          <span className="cost-report-card-title">{`Spend by ${primaryDimension.label}`}</span>
          <span className="cost-report-card-hint">splits distributed by ratio</span>
        </div>
        {productRows.map((row) => (
          <div key={row.key} className="cost-spend-row">
            <span
              className="cost-chip"
              style={{ '--chip-accent': row.key === 'unattributed' ? 'var(--danger)' : chipAccentFor(primaryDimension.id, row.key) } as CSSProperties}
            >
              {row.key}
            </span>
            <div className="cost-spend-bar-track">
              <div
                className="cost-spend-bar-fill"
                style={{
                  width: maxProductAmount === 0 ? '0%' : `${(Math.abs(row.amount) / maxProductAmount) * 100}%`,
                  background: row.key === 'unattributed' ? 'var(--danger)' : chipAccentFor(primaryDimension.id, row.key),
                }}
              />
            </div>
            <span className="cost-spend-amount">{formatMoney(row.amount)}</span>
            <span className="cost-spend-share">{formatPercent(row.share)}</span>
          </div>
        ))}
      </div>

      {secondDimension && crossTab && (
        <div className="cost-report-card">
          <div className="cost-report-card-header">
            <span className="cost-report-card-title">{`${primaryDimension.label} × ${secondDimension.label}`}</span>
          </div>
          <div className="cost-crosstab-header">
            <span className="cost-crosstab-cell" />
            {crossTabColKeys.map((colKey) => (
              <span key={colKey} className="cost-crosstab-cell cost-crosstab-cell--right">
                {colKey}
              </span>
            ))}
            <span className="cost-crosstab-cell cost-crosstab-cell--right">total</span>
          </div>
          {crossTabRows.map((row) => (
            <div key={row.rowKey} className="cost-crosstab-row">
              <span className="cost-crosstab-cell">{row.rowKey}</span>
              {row.cells.map((amount, index) => (
                <span key={index} className="cost-crosstab-cell cost-crosstab-cell--right">
                  {formatMoney(amount)}
                </span>
              ))}
              <span className="cost-crosstab-cell cost-crosstab-cell--right cost-crosstab-cell--total">
                {formatMoney(row.total)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
