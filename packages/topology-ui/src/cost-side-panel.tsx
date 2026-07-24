// The Cost view's side panel: toggles between the cost-rows list and a
// selected node's detail (its cost box layered onto the same `NodeDetail`
// the Topology/Drift views use), exactly as `SidePanel` (the Topology
// view's own) does.

import type { ReactElement } from 'react';
import type { ResolvedTopology } from '@workspec/topology-model';
import type { CostViewResult } from './context.js';
import { buildCostPanelData } from './cost-panel-data.js';
import { CostPanel } from './cost-panel.js';
import { formatMonthly } from './format-money.js';
import { NodeDetail } from './node-detail.js';
import type { NodeDetailCost } from './node-detail.js';

/** Props for {@link CostSidePanel}. */
export interface CostSidePanelProps {
  resolved: ResolvedTopology;
  result: CostViewResult;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  onClearSelection: () => void;
}

function costDetailFor(result: CostViewResult, slug: string): NodeDetailCost | undefined {
  const node = result.cost.nodes.find((n) => n.slug === slug);
  if (!node) return undefined;
  return {
    monthly: formatMonthly(node.monthly, result.catalog.spec.currency),
    sku: node.sku,
    committed: node.committed,
  };
}

export function CostSidePanel(props: CostSidePanelProps): ReactElement {
  const { resolved, result, selectedSlug, onSelect, onClearSelection } = props;

  if (selectedSlug !== null && resolved.resources.some((r) => r.slug === selectedSlug)) {
    const cost = costDetailFor(result, selectedSlug);
    return (
      <aside className="tp-side-panel" aria-label="Cost">
        <NodeDetail
          resolved={resolved}
          slug={selectedSlug}
          onBack={onClearSelection}
          {...(cost !== undefined ? { cost } : {})}
        />
      </aside>
    );
  }

  return (
    <aside className="tp-side-panel" aria-label="Cost">
      <CostPanel data={buildCostPanelData(resolved, result.cost, result.catalog.spec.currency)} onSelect={onSelect} />
    </aside>
  );
}
