// A resource's cost `mode` icon — a lock for `committed` (reserved, bills
// flat), a clock for anything else (schedulable / pay-as-you-go). Ported
// from the authoritative design's `modeIcon(mode, size)` method (Topology
// Workbench (drift + cost).dc.html). Shown next to the Cost view's per-node
// rows and a selected node's cost detail box.

import type { ReactElement } from 'react';

/** Props for {@link ModeIcon}. */
export interface ModeIconProps {
  /** Whether the resource is bound to a committed (reserved) pricing mode — see `@workspec/topology-cost`'s `NodeCost.committed`. */
  committed: boolean;
  /** Icon size in pixels. Defaults to 11. */
  size?: number;
}

/** A cost pricing mode's icon: a lock for committed/reserved, a clock otherwise. */
export function ModeIcon(props: ModeIconProps): ReactElement {
  const size = props.size ?? 11;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {props.committed ? (
        <>
          <rect x={5} y={11} width={14} height={9} rx={1.5} />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </>
      ) : (
        <>
          <circle cx={12} cy={12} r={8.5} />
          <path d="M12 7.5V12l3 2" />
        </>
      )}
    </svg>
  );
}
