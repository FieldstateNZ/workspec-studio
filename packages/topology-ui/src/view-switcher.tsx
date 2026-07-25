// The header's payload-view segmented control — Topology / Drift / Cost,
// ported from the authoritative design's view-nav row (Topology Workbench
// (drift + cost).dc.html), with its "Flows" button dropped (v0 has declared
// edges only, no flow overlays — see this package's implementation report).

import type { ReactElement } from 'react';

/** The three payload views `TopologyWorkbench` switches between. */
export type WorkbenchView = 'topology' | 'drift' | 'cost';

/** Props for {@link ViewSwitcher}. */
export interface ViewSwitcherProps {
  value: WorkbenchView;
  onChange: (view: WorkbenchView) => void;
}

const VIEW_LABEL: Record<WorkbenchView, string> = {
  topology: 'Topology',
  drift: 'Drift',
  cost: 'Cost',
};

const VIEW_ORDER: readonly WorkbenchView[] = ['topology', 'drift', 'cost'];

export function ViewSwitcher(props: ViewSwitcherProps): ReactElement {
  const { value, onChange } = props;

  return (
    <div className="tp-segmented" role="group" aria-label="View">
      {VIEW_ORDER.map((view) => (
        <button
          key={view}
          type="button"
          className={view === value ? 'tp-segment tp-segment-active' : 'tp-segment'}
          aria-pressed={view === value}
          onClick={() => onChange(view)}
        >
          {VIEW_LABEL[view]}
        </button>
      ))}
    </div>
  );
}
