// The facade's accessibility layer over the C4 layer's node card (#120):
// this package's shipped contract exposes every node as a focusable
// role="button" with an `${kind}: ${title}` label, Enter-to-activate, and
// a focus affordance — behaviours the raw enterprise card doesn't carry
// (its buttons are inner chrome). Implemented as a c4node ShapeUtil
// override whose Component wraps the real C4NodeComponent, so the C4
// layer (src/c4/) stays untouched and the a11y surface lives with the
// facade that promises it.

import { createContext, useContext, type FC, type KeyboardEvent, type MouseEvent } from 'react';
import type { PositionedNode } from '@workspec/c4-layout';
import type { ShapeUtil, ShapeId } from '@workspec/canvas';
import { useCanvasHover, useCanvasInstance } from '@workspec/canvas';
import { C4NodeComponent, c4NodeShapeUtil, type C4NodeShape } from '../c4/index.js';

export interface A11yBridge {
  /** nodeId → the caller's PositionedNode (kind may be null — label falls back to 'element'). */
  nodesById: ReadonlyMap<string, PositionedNode>;
  /** Whether activation applies to slug-less nodes too (an onSelect consumer exists). */
  isInteractive: (node: PositionedNode) => boolean;
  /** Enter on a focused node (same effect as a click). */
  onActivate: (shapeId: ShapeId) => void;
}

const noopBridge: A11yBridge = {
  nodesById: new Map<string, PositionedNode>(),
  isInteractive: () => false,
  onActivate: () => undefined,
};

export const A11yBridgeContext = createContext<A11yBridge>(noopBridge);

const A11yC4Node: FC<{ shape: C4NodeShape; isEditing: boolean }> = ({ shape, isEditing }) => {
  const bridge = useContext(A11yBridgeContext);
  const instance = useCanvasInstance();
  const setHovered = useCanvasHover((s) => s.setHovered);
  const node = bridge.nodesById.get(shape.slug);
  const label = `${node?.kind ?? 'element'}: ${node?.title ?? shape.label}`;
  const interactive = node ? bridge.isInteractive(node) : false;

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      bridge.onActivate(shape.id);
    }
  };

  // Assistive-tech / synthetic activation: a role=button activated by a
  // screen reader (or a test's fireEvent.click) dispatches a `click` with
  // `detail === 0` — no pointer gesture ever reaches the canvas pipeline,
  // so activate here. REAL mouse clicks (`detail >= 1`) are ignored: the
  // engine pipeline already activated on the pointerup of the same gesture
  // (and correctly suppressed it for drags).
  const handleClick = (e: MouseEvent<HTMLDivElement>): void => {
    if (e.detail === 0) bridge.onActivate(shape.id);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-disabled={!interactive}
      data-node-id={shape.slug}
      onKeyDown={handleKeyDown}
      onClick={handleClick}
      // Keyboard focus mirrors pointer hover (the card's accent outline is
      // the focus affordance, exactly as hover) — parity with the previous
      // facade's focus ring behaviour.
      onFocus={() => {
        setHovered(shape.id);
      }}
      onBlur={() => {
        const current = instance.hover.getState().hoveredId;
        if (current === shape.id) setHovered(null);
      }}
      style={{ width: shape.width, height: shape.height, outline: 'none', pointerEvents: 'auto' }}
    >
      <C4NodeComponent shape={shape} isEditing={isEditing} />
    </div>
  );
};

/** The c4node util with the facade's a11y wrapper as its Component. */
export const a11yC4NodeShapeUtil: ShapeUtil<C4NodeShape> = {
  ...c4NodeShapeUtil,
  Component: A11yC4Node,
};
