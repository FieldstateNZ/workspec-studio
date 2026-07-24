// The side panel: toggles between the resource list and a selected node's
// detail, exactly as the design's `pFlow`/`pDetail` split does — selecting
// a resource (from the list OR the canvas) shows its detail; the detail's
// back control clears the selection and returns to the list.

import type { ReactElement } from 'react';
import type { LensId, LensTree, ResolvedTopology } from '@workspec/topology-model';
import { NodeDetail } from './node-detail.js';
import { ResourceList } from './resource-list.js';

/** Props for {@link SidePanel}. */
export interface SidePanelProps {
  resolved: ResolvedTopology;
  tree: LensTree;
  lens: LensId;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  onClearSelection: () => void;
}

export function SidePanel(props: SidePanelProps): ReactElement {
  const { resolved, tree, lens, selectedSlug, onSelect, onClearSelection } = props;

  return (
    <aside className="tp-side-panel" aria-label="Topology resources">
      {selectedSlug !== null ? (
        <NodeDetail resolved={resolved} slug={selectedSlug} onBack={onClearSelection} />
      ) : (
        <ResourceList
          resolved={resolved}
          tree={tree}
          lens={lens}
          selectedSlug={selectedSlug}
          onSelect={onSelect}
        />
      )}
    </aside>
  );
}
