// Cost · Plan review — a read-only render of a committed `*.tagplan.yaml`.
// Apply runs in the CLI, not here; this view only shows what it would do and
// warns when the plan's baseline has drifted from the current inventory.

import { useMemo } from 'react';
import type { ReactElement } from 'react';
import type { Ref, TagPlanEntryType } from '@workspec/cost-schema';
import { useInventory, useTagPlan } from './context.js';

export interface TagPlanViewProps {
  inventoryRef: Ref;
  tagPlanRef?: Ref;
}

const ROW_CAP = 14;
const ACTION_RANK: Record<TagPlanEntryType['action'], number> = { remove: 0, change: 1, add: 2, noop: 3 };

function displayName(ref: string): string {
  const segments = ref.split('/');
  return segments[segments.length - 1] ?? ref;
}

export function TagPlanView(props: TagPlanViewProps): ReactElement {
  const { inventoryRef, tagPlanRef } = props;
  const inventoryQuery = useInventory(inventoryRef);
  const tagPlanQuery = useTagPlan(tagPlanRef);

  const nonNoopSorted = useMemo(() => {
    if (!tagPlanQuery.data) return [];
    return tagPlanQuery.data.spec.entries
      .filter((e) => e.action !== 'noop')
      .slice()
      .sort((a, b) => ACTION_RANK[a.action] - ACTION_RANK[b.action]);
  }, [tagPlanQuery.data]);

  if (tagPlanRef === undefined) {
    return (
      <div className="cost-plan-empty">
        <p className="cost-plan-empty-title">No tag plan selected.</p>
        <p className="cost-plan-empty-copy">
          {'Build one with '}
          <code className="cost-plan-empty-code">$ workspec-cost plan</code>
          {', then commit the resulting *.tagplan.yaml for review here.'}
        </p>
      </div>
    );
  }

  if (tagPlanQuery.isPending || inventoryQuery.isPending) {
    return <div className="cost-notice">Loading tag plan…</div>;
  }
  if (tagPlanQuery.isError) {
    return <div className="cost-notice cost-notice-error">{`Could not load: ${tagPlanQuery.error.message}`}</div>;
  }
  if (!tagPlanQuery.data) {
    return <div className="cost-notice cost-notice-error">Tag plan not found.</div>;
  }

  const tagPlan = tagPlanQuery.data;
  const counts = { add: 0, change: 0, remove: 0, noop: 0 };
  for (const entry of tagPlan.spec.entries) counts[entry.action] += 1;

  const drifted = inventoryQuery.data !== undefined && inventoryQuery.data.spec.asOf !== tagPlan.spec.baselineAsOf;
  const rows = nonNoopSorted.slice(0, ROW_CAP);

  return (
    <div className="cost-plan">
      <div className="cost-plan-header">
        <span className="cost-plan-header-id">{displayName(tagPlanRef)}</span>
        <span className="cost-plan-header-baseline">{`baseline: inventory asOf ${tagPlan.spec.baselineAsOf}`}</span>
        {drifted && <span className="cost-plan-drift-pill">baseline drifted — stocktake before apply</span>}
        <span className="cost-plan-counts">
          <span className="cost-plan-count cost-plan-count--add">{`+${counts.add} add`}</span>
          {' · '}
          <span className="cost-plan-count cost-plan-count--change">{`~${counts.change} change`}</span>
          {' · '}
          <span className="cost-plan-count cost-plan-count--remove">{`−${counts.remove} remove`}</span>
          {' · '}
          <span className="cost-plan-count cost-plan-count--noop">{`${counts.noop} noop`}</span>
        </span>
      </div>

      <div className="cost-plan-table">
        <div className="cost-plan-table-header">
          <span className="cost-table-header-cell">Resource</span>
          <span className="cost-table-header-cell">tag</span>
          <span className="cost-table-header-cell cost-table-header-cell--right">current</span>
          <span className="cost-table-header-cell" />
          <span className="cost-table-header-cell">desired</span>
          <span className="cost-table-header-cell cost-table-header-cell--right">op</span>
        </div>
        {rows.map((entry, index) => (
          <div key={`${entry.resourceId}:${entry.tag}:${index}`} className="cost-plan-row">
            <span className="cost-table-cell-resource-name">{entry.resourceId}</span>
            <span className="cost-plan-tag">{entry.tag}</span>
            <span className="cost-plan-current">{entry.current ?? '—'}</span>
            <span className="cost-plan-arrow">→</span>
            <span className="cost-plan-desired">{entry.desired ?? '—'}</span>
            <span className={`cost-plan-op-badge cost-plan-op-badge--${entry.action}`}>{entry.action}</span>
          </div>
        ))}
        <div className="cost-table-footer">
          {nonNoopSorted.length > ROW_CAP
            ? `… ${nonNoopSorted.length - ROW_CAP} more operations · noops omitted`
            : `${nonNoopSorted.length} operations · noops omitted`}
        </div>
      </div>

      <p className="cost-plan-footer">
        {'Read-only render of the committed plan. Apply runs in the CLI — '}
        <code className="cost-plan-footer-code">$ workspec-cost apply</code>
        {' — and refuses if the live account has drifted from this baseline.'}
      </p>
    </div>
  );
}
