import type { ShapeUtil } from '../../shape-util.js';
import type { ImageShape } from '../../shape-types.js';
import type { Box, Vec2 } from '../../types.js';
import { hitTestPointInRect } from '../../utils/geometry.js';
import { ImageShapeComponent } from './image-shape.js';

export const imageShapeUtil: ShapeUtil<ImageShape> = {
  type: 'image',

  defaultProps: (point: Vec2) => ({
    type: 'image' as const,
    x: point.x,
    y: point.y,
    width: 200,
    height: 200,
    src: '',
    naturalWidth: 200,
    naturalHeight: 200,
  }),

  getBounds: (shape: ImageShape): Box => ({
    x: shape.x,
    y: shape.y,
    width: shape.width,
    height: shape.height,
  }),

  hitTest: (shape: ImageShape, localPoint: Vec2): boolean =>
    hitTestPointInRect(localPoint, { x: 0, y: 0, width: shape.width, height: shape.height }),

  canResize: () => true,
  canEditText: () => false,

  Component: ImageShapeComponent,
};
