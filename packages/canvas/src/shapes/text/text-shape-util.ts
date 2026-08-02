import type { ShapeUtil } from '../../shape-util.js';
import type { TextShape } from '../../shape-types.js';
import type { Box, Vec2 } from '../../types.js';
import { hitTestPointInRect } from '../../utils/geometry.js';
import { TextShapeComponent } from './text-shape.js';

export const textShapeUtil: ShapeUtil<TextShape> = {
  type: 'text',

  defaultProps: (point: Vec2) => ({
    type: 'text' as const,
    x: point.x,
    y: point.y,
    width: 200,
    height: 40,
    text: '',
    fontSize: 16,
    fontWeight: 400 as const,
  }),

  getBounds: (shape: TextShape): Box => ({
    x: shape.x,
    y: shape.y,
    width: shape.width,
    height: shape.height,
  }),

  hitTest: (shape: TextShape, localPoint: Vec2): boolean =>
    hitTestPointInRect(localPoint, { x: 0, y: 0, width: shape.width, height: shape.height }),

  canResize: () => true,
  canEditText: () => true,

  Component: TextShapeComponent,
};
