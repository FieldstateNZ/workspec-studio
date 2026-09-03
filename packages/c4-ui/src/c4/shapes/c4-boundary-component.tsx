import type { FC } from 'react';
import type { C4BoundaryShape } from '../c4-types.js';

interface Props {
  shape: C4BoundaryShape;
}

// The C4 boundary — a semi-transparent enclosing panel (the parent system /
// container, depending on the active level). Contained nodes sit ON it;
// actors and external systems sit OUTSIDE its footprint. It paints behind
// every node (its index is below the connector band), so the fill reads as
// the surface the interior lives on, and the border makes it a distinct
// object you drop into.
//
// pointer-events:none so clicks fall through to the nodes inside and the
// pane behind it — the boundary is never a drag/select target (its
// ShapeUtil.hitTest also returns false, so canvas hit-testing skips it
// entirely; the isContextMenuSurface capability keeps right-click working
// INSIDE it). Ported verbatim from the enterprise C4BoundaryComponent.
export const C4BoundaryComponent: FC<Props> = ({ shape }) => {
  return (
    <div
      aria-label={`System boundary: ${shape.label}`}
      style={{
        position: 'relative',
        width: shape.width,
        height: shape.height,
        borderRadius: 16,
        background: `color-mix(in oklab, ${shape.accent} 7%, transparent)`,
        border: `1.5px solid color-mix(in oklab, ${shape.accent} 32%, transparent)`,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 16,
          top: -10,
          padding: '1px 8px',
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.18em',
          whiteSpace: 'nowrap',
          borderRadius: 4,
          color: shape.accent,
          background: 'var(--bg)',
        }}
      >
        {shape.label}
      </div>
    </div>
  );
};
