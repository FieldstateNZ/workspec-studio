import { memo, type FC } from 'react';
import { useCanvasInstance, useCanvasStore } from '../canvas-provider.js';
import { useCanvasViewport } from '../canvas-viewport.js';
import { Shape } from './shape.js';
import type { Camera, Shape as ShapeType } from '../types.js';

// World-space margin around the viewport so shapes pop in before their
// edge reaches the screen during pans.
const CULL_MARGIN = 400;

function isInViewport(
  shape: ShapeType,
  camera: Camera,
  viewportW: number,
  viewportH: number,
): boolean {
  // Connectors span their endpoints and re-derive geometry from the live
  // store — their own x/y/w/h can lag a drag, so never cull them.
  if (shape.type === 'connector') return true;
  // screen = (page - camera) * zoom (transforms.ts), so the visible world
  // rect runs from camera.xy to camera.xy + viewport/zoom.
  const left = camera.x - CULL_MARGIN;
  const top = camera.y - CULL_MARGIN;
  const right = camera.x + viewportW / camera.zoom + CULL_MARGIN;
  const bottom = camera.y + viewportH / camera.zoom + CULL_MARGIN;
  return (
    shape.x + shape.width >= left &&
    shape.x <= right &&
    shape.y + shape.height >= top &&
    shape.y <= bottom
  );
}

/**
 * The shape render layer: index-sorted (back→front) with 400px-margin
 * viewport culling against the MEASURED canvas rect — the enterprise
 * version culled against `window.inner*`, which over- or under-culls any
 * embedded canvas (#117/#118). Un-measured viewport (no enclosing Canvas
 * yet) skips culling entirely rather than guessing a window size.
 * `hiddenKinds` filters via the instance's injected `kindResolver` (the S1
 * debt item — the wiring is live here, not just stored).
 */
export const ShapeLayer: FC = memo(() => {
  const instance = useCanvasInstance();
  const shapes = useCanvasStore((s) => s.shapes);
  const camera = useCanvasStore((s) => s.camera);
  const hiddenKinds = useCanvasStore((s) => s.hiddenKinds);
  const viewport = useCanvasViewport();
  const kindOf = instance.kindResolver;

  const cull = viewport !== null && viewport.width > 0 && viewport.height > 0;
  const sorted = Object.values(shapes)
    .filter((s) => hiddenKinds.size === 0 || !hiddenKinds.has(kindOf(s)))
    .filter((s) => !cull || isInViewport(s, camera, viewport.width, viewport.height))
    .sort((a, b) => a.index.localeCompare(b.index));

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
      }}
    >
      {sorted.map((shape) => (
        <Shape key={shape.id} shape={shape} />
      ))}
    </div>
  );
});

ShapeLayer.displayName = 'ShapeLayer';
