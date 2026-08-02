import type { ShapeUtil } from '../../shape-util.js';
import type { DrawShape } from '../../shape-types.js';
import type { Box, Vec2 } from '../../types.js';
import { hitTestPointToPolyline } from '../../utils/geometry.js';
import { DRAW_DEFAULT_STROKE } from '../../style/shape-defaults.js';
import { DrawShapeComponent } from './draw-shape.js';

export const drawShapeUtil: ShapeUtil<DrawShape> = {
  type: 'draw',

  defaultProps: (point: Vec2) => ({
    type: 'draw' as const,
    x: point.x,
    y: point.y,
    width: 1,
    height: 1,
    points: [],
    strokeWidth: 2,
    color: DRAW_DEFAULT_STROKE,
  }),

  getBounds: (shape: DrawShape): Box => ({
    x: shape.x,
    y: shape.y,
    width: shape.width,
    height: shape.height,
  }),

  hitTest: (shape: DrawShape, localPoint: Vec2): boolean => {
    if (shape.points.length < 2) return false;
    return hitTestPointToPolyline(localPoint, shape.points, 8);
  },

  canResize: () => false,
  canEditText: () => false,

  Component: DrawShapeComponent,
};
