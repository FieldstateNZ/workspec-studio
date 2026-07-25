// One container's boundary box: a dashed (vnet/subnet) or solid
// (resource-group) rect with a label row (glyph + name + a generic "N
// resources" meta), ported from the design's `bounds` markup. `vnet` and
// `resource-group` get the ACCENTED treatment (coloured border + icon);
// `subnet` stays neutral so it visually recedes beneath its parent vnet —
// see `kind-meta.ts`'s `boundaryAccentVar`.
//
// Meta text: the design showed a CIDR/region string (`"10.0.0.0/16"`,
// `"australiaeast · 3"`) pulled from that one fixture's own resource
// `config`/naming data. `ResolvedResource.config` is an open, provider-
// specific bag with no guaranteed keys across providers/kinds, so this
// package can't assume an `addressSpace`/`prefix`/region field exists —
// showing the container's own child count instead is the generic
// equivalent every container has, regardless of provider (judgment call).

import type { CSSProperties, ReactElement } from 'react';
import type { LensContainer } from '@workspec/topology-model';
import { Glyph } from './glyph.js';
import { boundaryAccentVar } from './kind-meta.js';
import type { Rect } from './geometry/rect.js';

/** Props for {@link BoundaryBox}. */
export interface BoundaryBoxProps {
  container: LensContainer;
  rect: Rect;
  /** P6 extension point (Cost view) — a formatted monthly subtotal badge (e.g. `"$1,980/mo"`) for every resource placed under this boundary. Omit for no badge. */
  costLabel?: string;
}

function childCountLabel(container: LensContainer): string {
  const count = container.children.length;
  return `${count} resource${count === 1 ? '' : 's'}`;
}

export function BoundaryBox(props: BoundaryBoxProps): ReactElement {
  const { container, rect, costLabel } = props;
  const accent = boundaryAccentVar(container.kind);
  const dashed = container.kind !== 'resource-group';
  const radius = container.kind === 'resource-group' ? 12 : 14;

  const style: CSSProperties = {
    left: rect.x,
    top: rect.y,
    width: rect.width,
    height: rect.height,
    borderStyle: dashed ? 'dashed' : 'solid',
    borderColor: dashed ? `color-mix(in oklab, ${accent} 45%, var(--line-2))` : 'var(--line-2)',
    borderRadius: radius,
    background:
      container.kind === 'vnet'
        ? `color-mix(in oklab, ${accent} 8%, transparent)`
        : 'color-mix(in oklab, var(--ink) 3%, transparent)',
  };

  return (
    <div className="tp-boundary" style={style}>
      <div className="tp-boundary-label">
        <span className="tp-boundary-icon" style={{ color: accent }}>
          <Glyph kind={container.kind} size={15} />
        </span>
        <span className="tp-boundary-name">{container.name}</span>
        <span className="tp-boundary-meta">{childCountLabel(container)}</span>
      </div>
      {costLabel !== undefined && <span className="tp-boundary-cost">{`${costLabel}/mo`}</span>}
    </div>
  );
}
