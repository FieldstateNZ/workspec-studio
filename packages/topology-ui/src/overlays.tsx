// The P5/P6 canvas overlay seams: `TopologyWorkbench`'s `driftBySlug`/
// `costBySlug` props thread down to `NodeCard`, plus the two small badges
// that render when a slug has an entry.
//
// `DriftClass` is now the REAL contract from `@workspec/topology-recon`'s
// `reconcile()` (`phantom | orphan | divergent | miswired`) — re-exported
// here rather than imported directly by every consumer, so this module stays
// the one seam a future recon-shape change touches. It replaces the
// placeholder `'added' | 'removed' | 'changed'` union this file used to
// define before `@workspec/topology-recon` existed.
//
// `NodeCost` stays the SAME deliberately minimal local shape it always was
// — "just enough to render '$123/mo'", not `@workspec/topology-cost`'s full
// priced-`NodeCost` shape. The Cost VIEW (see `cost-canvas-data.ts`) maps the
// engine's richer result down to this shape for the canvas pill; the side
// panel and node detail read the engine's own types directly where more
// detail earns its keep.

import type { ReactElement } from 'react';
import type { DriftClass } from '@workspec/topology-recon';
import { DriftGlyph } from './drift-glyph.js';
import { DRIFT_META, driftColorVar } from './drift-meta.js';
import { formatMonthly } from './format-money.js';

export type { DriftClass };

/** A node's cost pill data (P6) — deliberately just enough to render "$123/mo", not a full priced-cost shape. */
export interface NodeCost {
  /** Monthly amount in the given currency's minor-unit-free display form (e.g. `128.4` for "$128.40"). */
  readonly monthly: number;
  /** ISO 4217 currency code, e.g. "USD". */
  readonly currency: string;
}

/**
 * A small colour-blind-safe shape badge for a node's drift class — shape
 * AND colour AND an accessible label, never colour alone (see
 * `drift-glyph.tsx`).
 */
export function DriftBadge(props: { drift: DriftClass }): ReactElement {
  const meta = DRIFT_META[props.drift];
  return (
    <span
      className={`tp-drift-badge tp-drift-badge-${props.drift}`}
      style={{ color: driftColorVar(props.drift) }}
      role="img"
      aria-label={`Drift: ${meta.label}`}
      title={meta.label}
    >
      <DriftGlyph drift={props.drift} size={11} />
    </span>
  );
}

/** A small pill showing a node's monthly cost. */
export function CostPill(props: { cost: NodeCost }): ReactElement {
  return <span className="tp-cost-pill">{`${formatMonthly(props.cost.monthly, props.cost.currency)}/mo`}</span>;
}
