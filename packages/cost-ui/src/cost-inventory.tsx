// Cost · Inventory — a read view over the stock-take, cross-referenced
// against the current attribution so unattributed resources carry a danger
// inset bar. The dossier's Inventory frame (§2.3) also drew a "Stock-take
// drift" strip with four fabricated drift rows; those aren't derivable from
// any artifact this package reads (there is no live-vs-snapshot pair to
// diff), so per the C5a brief this view renders the honest alternative: an
// asOf/count strip and a caption pointing at the CLI that actually computes
// drift.

import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import type { Ref } from '@workspec/cost-schema';
import { attribute } from '@workspec/cost-engine';
import { useCostArtifacts } from './context.js';
import { formatMoney } from './format.js';

export interface CostInventoryProps {
  inventoryRef: Ref;
  attributionRef: Ref;
}

type InventoryFilter = 'all' | 'unattributed' | 'hasTags';

const ROW_CAP = 12;
const TOP_TYPE_COUNT = 5;

function formatTags(tags: Record<string, string> | undefined): string {
  if (!tags) return '—';
  const entries = Object.entries(tags);
  if (entries.length === 0) return '—';
  return entries.map(([k, v]) => `${k}=${v}`).join(' · ');
}

export function CostInventory(props: CostInventoryProps): ReactElement {
  const { inventoryRef, attributionRef } = props;
  const { inventory, attribution, spends, isPending, isError, error } = useCostArtifacts(
    inventoryRef,
    attributionRef,
  );
  const [filter, setFilter] = useState<InventoryFilter>('all');

  const result = useMemo(
    () => (inventory && attribution && spends ? attribute(inventory, spends, attribution) : undefined),
    [inventory, attribution, spends],
  );

  const primaryDimension = attribution?.spec.dimensions[0];

  const unattributedIds = useMemo(() => {
    if (!result) return new Set<string>();
    return new Set(
      result.resolutions
        .filter((r) => r.assignments[result.primaryDimensionId] === undefined)
        .map((r) => r.resourceId),
    );
  }, [result]);

  const topTypes = useMemo(() => {
    if (!inventory) return [];
    const counts = new Map<string, number>();
    for (const resource of inventory.spec.resources) {
      counts.set(resource.type, (counts.get(resource.type) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_TYPE_COUNT)
      .map(([type, count]) => ({ type, count }));
  }, [inventory]);

  const hasTagsCount = useMemo(
    () => (inventory ? inventory.spec.resources.filter((r) => r.tags !== undefined).length : 0),
    [inventory],
  );

  const pool = useMemo(() => {
    if (!inventory) return [];
    if (filter === 'unattributed') return inventory.spec.resources.filter((r) => unattributedIds.has(r.id));
    if (filter === 'hasTags') return inventory.spec.resources.filter((r) => r.tags !== undefined);
    return inventory.spec.resources;
  }, [inventory, filter, unattributedIds]);

  if (isPending) return <div className="cost-notice">Loading inventory…</div>;
  if (isError) return <div className="cost-notice cost-notice-error">{`Could not load: ${error?.message ?? 'unknown error'}`}</div>;
  if (!inventory) return <div className="cost-notice cost-notice-error">Inventory not found.</div>;

  const resourceGroupCount = new Set(inventory.spec.resources.map((r) => r.resourceGroup)).size;
  const rows = pool.slice(0, ROW_CAP);

  return (
    <div className="cost-inventory">
      <div className="cost-inventory-strip">
        <span className="cost-inventory-strip-text">
          {`asOf ${inventory.spec.asOf} · ${inventory.spec.resources.length} resources · ${resourceGroupCount} resource groups`}
        </span>
        <span className="cost-inventory-strip-caption">run workspec-cost stocktake to check for drift</span>
      </div>

      <div className="cost-inventory-filter-row">
        <button
          type="button"
          className={`cost-filter-chip${filter === 'all' ? ' cost-filter-chip--active' : ''}`}
          onClick={() => setFilter('all')}
        >
          {`All · ${inventory.spec.resources.length}`}
        </button>
        <button
          type="button"
          className={`cost-filter-chip${filter === 'unattributed' ? ' cost-filter-chip--active' : ''}`}
          onClick={() => setFilter('unattributed')}
        >
          {`Unattributed · ${unattributedIds.size}`}
        </button>
        <button
          type="button"
          className={`cost-filter-chip${filter === 'hasTags' ? ' cost-filter-chip--active' : ''}`}
          onClick={() => setFilter('hasTags')}
        >
          {`Has tags · ${hasTagsCount}`}
        </button>
        <span className="cost-inventory-type-chips">
          {topTypes.map(({ type, count }) => (
            <span key={type} className="cost-type-chip">{`${type} ×${count}`}</span>
          ))}
        </span>
      </div>

      <div className="cost-inventory-table">
        <div className="cost-inventory-header">
          <span className="cost-table-header-cell">Resource</span>
          <span className="cost-table-header-cell">Resource group</span>
          <span className="cost-table-header-cell">Existing tags</span>
          <span className="cost-table-header-cell cost-table-header-cell--right">$/mo</span>
        </div>
        {rows.map((resource) => {
          const unattributed = unattributedIds.has(resource.id);
          return (
            <div
              key={resource.id}
              className={`cost-inventory-row${unattributed ? ' cost-inventory-row--unattributed' : ''}`}
            >
              <span className="cost-table-cell-resource">
                <span className="cost-table-cell-resource-name">{resource.name}</span>
                <span className="cost-table-cell-resource-type">{resource.type}</span>
              </span>
              <span className="cost-table-cell-rg">{resource.resourceGroup}</span>
              <span className="cost-inventory-tags">{formatTags(resource.tags)}</span>
              <span className="cost-table-cell-spend">
                {formatMoney(result?.resourceSpend[resource.id] ?? 0)}
              </span>
            </div>
          );
        })}
        <div className="cost-table-footer">
          {pool.length > ROW_CAP
            ? `… ${pool.length - ROW_CAP} more resources`
            : `${pool.length} resources shown`}
        </div>
      </div>
      <p className="cost-inventory-caption">
        {`Rows flagged ▍ have no resolved ${primaryDimension?.label ?? primaryDimension?.id ?? 'primary dimension'} — fix them in the Attribution tab.`}
      </p>
    </div>
  );
}
