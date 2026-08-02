import type { FC } from 'react';
import { useCanvasStore } from '../canvas-provider.js';
import { pageToScreen } from '../utils/transforms.js';

/** The live marquee-selection rectangle (screen space, from `store.marquee`). */
export const MarqueeBox: FC = () => {
  const marquee = useCanvasStore((s) => s.marquee);
  const camera = useCanvasStore((s) => s.camera);

  if (!marquee) return null;

  const start = pageToScreen({ x: marquee.startX, y: marquee.startY }, camera);
  const end = pageToScreen({ x: marquee.endX, y: marquee.endY }, camera);

  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        height,
        border: '1px dashed var(--accent)',
        backgroundColor: 'var(--accent-soft)',
        borderRadius: 'var(--r-2)',
        pointerEvents: 'none',
      }}
    />
  );
};
