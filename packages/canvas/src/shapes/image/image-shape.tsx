import type { FC } from 'react';
import type { ImageShape } from '../../shape-types.js';

interface Props {
  shape: ImageShape;
  isEditing: boolean;
}

export const ImageShapeComponent: FC<Props> = ({ shape }) => (
  <img
    src={shape.src}
    draggable={false}
    style={{
      display: 'block',
      width: shape.width,
      height: shape.height,
      objectFit: 'fill',
      borderRadius: 'var(--r-2)',
      userSelect: 'none',
      pointerEvents: 'none',
    }}
  />
);
