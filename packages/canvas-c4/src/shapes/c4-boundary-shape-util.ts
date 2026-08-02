import type { Box, ShapeUtil, Vec2 } from '@workspec/canvas';
import type { C4BoundaryShape } from '../c4-types.js';
import { C4BoundaryComponent } from './c4-boundary-component.js';

// The derived "system boundary" frame. Padding around the inside-node
// bounding box, and a default footprint when the system has no inside
// nodes yet.
export const C4_BOUNDARY_PAD = 48;
export const C4_BOUNDARY_DEFAULT_W = 600;
export const C4_BOUNDARY_DEFAULT_H = 360;

export const c4BoundaryShapeUtil: ShapeUtil<C4BoundaryShape> = {
  type: 'c4boundary',

  defaultProps: (point: Vec2) => ({
    type: 'c4boundary' as const,
    x: point.x - C4_BOUNDARY_DEFAULT_W / 2,
    y: point.y - C4_BOUNDARY_DEFAULT_H / 2,
    width: C4_BOUNDARY_DEFAULT_W,
    height: C4_BOUNDARY_DEFAULT_H,
    label: 'System',
    accent: 'var(--el-system)',
  }),

  getBounds: (shape: C4BoundaryShape): Box => ({
    x: shape.x,
    y: shape.y,
    width: shape.width,
    height: shape.height,
  }),

  // Purely presentational: never a hit target, so clicks/drags pass through
  // to the nodes inside it and to the pane (right-click menu) behind it.
  hitTest: () => false,
  canResize: () => false,
  canEditText: () => false,

  // The S2 capability that replaced the enterprise Canvas's hard-coded
  // `'c4_boundary'` id gate: right-clicking EMPTY canvas inside this
  // pointer-through panel opens the container-level context menu (and
  // enables the auto-layout item when the host wires one).
  isContextMenuSurface: () => true,

  Component: C4BoundaryComponent,
};
