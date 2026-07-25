// One node's canvas card: glyph + name + vendor type, ported from the
// design's node markup. Selection renders a two-tone ring (border + focus
// colour), matching the design's `selected` style. The `drift`/`cost` props
// are the P5/P6 extension-point seams (see `overlays.tsx`) — omitted, the
// card renders exactly as the design does; present, a badge/pill layers on
// without changing the card's own layout.

import type { CSSProperties, ReactElement } from 'react';
import type { ResourceKindType } from '@workspec/topology-schema';
import { Glyph } from './glyph.js';
import { kindColorVar, kindDisplayName } from './kind-meta.js';
import { CostPill, DriftBadge } from './overlays.js';
import type { DriftClass, NodeCost } from './overlays.js';
import type { Rect } from './geometry/rect.js';

/** Props for {@link NodeCard}. */
export interface NodeCardProps {
  slug: string;
  kind: ResourceKindType;
  name: string;
  /** Vendor-specific display type, e.g. "Azure App Service". */
  type: string;
  rect: Rect;
  selected: boolean;
  onSelect: (slug: string) => void;
  /** P5 extension point — see `overlays.ts`. Omit for no badge. */
  drift?: DriftClass;
  /** P6 extension point — see `overlays.ts`. Omit for no pill. */
  cost?: NodeCost;
}

export function NodeCard(props: NodeCardProps): ReactElement {
  const { slug, kind, name, type, rect, selected, onSelect, drift, cost } = props;
  const accent = kindColorVar(kind);

  const style: CSSProperties = {
    left: rect.x,
    top: rect.y,
    width: rect.width,
    height: rect.height,
  };

  const classes = ['tp-node'];
  if (selected) classes.push('tp-node-selected');
  if (drift !== undefined) classes.push(`tp-node-drift-${drift}`);

  return (
    <button
      type="button"
      className={classes.join(' ')}
      style={style}
      onClick={() => onSelect(slug)}
      aria-pressed={selected}
      title={`${name} (${kindDisplayName(kind)})`}
    >
      <span className="tp-node-icon" style={{ color: accent, background: `color-mix(in oklab, ${accent} 15%, transparent)` }}>
        <Glyph kind={kind} size={19} />
      </span>
      <span className="tp-node-text">
        <span className="tp-node-name">{name}</span>
        <span className="tp-node-type">{type}</span>
      </span>
      {drift !== undefined && <DriftBadge drift={drift} />}
      {cost !== undefined && <CostPill cost={cost} />}
    </button>
  );
}
