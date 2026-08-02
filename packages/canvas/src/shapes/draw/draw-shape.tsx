import type { FC } from 'react';
import type { DrawShape } from '../../shape-types.js';
import { useCanvasStore } from '../../canvas-provider.js';
import { pointsToSvgPath } from './smooth.js';

interface Props {
  shape: DrawShape;
  isEditing: boolean;
}

export const DrawShapeComponent: FC<Props> = ({ shape }) => {
  const lens = useCanvasStore((s) => s.lens);

  if (shape.points.length === 0) return null;

  const path = pointsToSvgPath(shape.points);

  return (
    <svg
      width={shape.width}
      height={shape.height}
      style={{
        overflow: 'visible',
        display: 'block',
        opacity: lens === 'structured' ? 0.15 : 1,
        transition: 'opacity 0.28s ease',
        pointerEvents: lens === 'structured' ? 'none' : undefined,
      }}
    >
      {path && (
        <path
          d={path}
          stroke={shape.color}
          strokeWidth={shape.strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
};
