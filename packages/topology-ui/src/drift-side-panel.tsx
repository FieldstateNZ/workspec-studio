// The Drift view's side panel: toggles between the drift-classes list and a
// selected slug's detail, exactly as `SidePanel` (the Topology view's own)
// does — except a selected slug can name EITHER an authored resource (routed
// through `NodeDetail`, enriched with its drift) or an actual-only orphan
// (routed through the lighter `OrphanDetail` — see that file's header
// comment for why these are two components, not one).

import type { ReactElement } from 'react';
import type { ResolvedTopology } from '@workspec/topology-model';
import type { ReconcileResult } from './context.js';
import { buildDriftGroups, driftForAuthoredSlug, orphanDriftForSlug } from './drift-panel-data.js';
import { DriftPanel } from './drift-panel.js';
import { NodeDetail } from './node-detail.js';
import { OrphanDetail } from './orphan-detail.js';

/** Props for {@link DriftSidePanel}. */
export interface DriftSidePanelProps {
  resolved: ResolvedTopology;
  result: ReconcileResult;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  onClearSelection: () => void;
}

export function DriftSidePanel(props: DriftSidePanelProps): ReactElement {
  const { resolved, result, selectedSlug, onSelect, onClearSelection } = props;

  if (selectedSlug !== null) {
    const authoredResource = resolved.resources.find((r) => r.slug === selectedSlug);
    if (authoredResource) {
      const drift = driftForAuthoredSlug(result.drifts, selectedSlug);
      return (
        <aside className="tp-side-panel" aria-label="Drift">
          <NodeDetail
            resolved={resolved}
            slug={selectedSlug}
            onBack={onClearSelection}
            {...(drift !== undefined ? { drift } : {})}
          />
        </aside>
      );
    }

    const orphanResource = result.derived.resources.find((r) => r.slug === selectedSlug);
    if (orphanResource) {
      const drift = orphanDriftForSlug(result.drifts, selectedSlug);
      return (
        <aside className="tp-side-panel" aria-label="Drift">
          <OrphanDetail
            resource={orphanResource}
            onBack={onClearSelection}
            {...(drift !== undefined ? { drift } : {})}
          />
        </aside>
      );
    }
  }

  return (
    <aside className="tp-side-panel" aria-label="Drift">
      <DriftPanel
        groups={buildDriftGroups(resolved, result.derived, result.drifts)}
        summary={result.summary}
        onSelect={onSelect}
      />
    </aside>
  );
}
