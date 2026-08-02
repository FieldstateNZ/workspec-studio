import type { ShapeUtil } from '../../shape-util.js';
import type { StickyShape } from '../../shape-types.js';
import type { Box, Vec2 } from '../../types.js';
import { hitTestPointInRect } from '../../utils/geometry.js';
import { getStickyDefaults } from '../../utils/sticky-defaults.js';
import { StickyShapeComponent } from './sticky-shape.js';

export const stickyShapeUtil: ShapeUtil<StickyShape> = {
  type: 'sticky',

  defaultProps: (point: Vec2) => {
    const { color, fontFamily } = getStickyDefaults();
    const width = 210;
    const height = 150;
    return {
      type: 'sticky' as const,
      x: point.x - width / 2,
      y: point.y - height / 2,
      width,
      height,
      text: '',
      color,
      fontFamily,
    };
  },

  getBounds: (shape: StickyShape): Box => ({
    x: shape.x,
    y: shape.y,
    width: shape.width,
    height: shape.height,
  }),

  hitTest: (shape: StickyShape, localPoint: Vec2): boolean =>
    hitTestPointInRect(localPoint, { x: 0, y: 0, width: shape.width, height: shape.height }),

  canResize: () => true,
  canEditText: () => true,

  // Sticky notes render the spec's twin box-shadow selection ring inside
  // StickyShapeComponent (and carry a deterministic tilt the AABB rect
  // doesn't follow) — the SelectionLayer must not double it up. Replaces
  // the enterprise SelectionLayer's hard-coded 'sticky' opt-out.
  selfRendersSelection: () => true,

  Component: StickyShapeComponent,
};
