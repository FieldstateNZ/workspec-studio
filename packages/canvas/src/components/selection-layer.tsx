import type { FC } from 'react';
import { useCanvasInstance, useCanvasStore } from '../canvas-provider.js';
import { pageToScreen } from '../utils/transforms.js';
import { effectivePosition } from '../utils/lens.js';
import type { Shape } from '../types.js';

const HANDLE_R = 6;
const ROTATION_OFFSET = 30;

/**
 * Screen-space SVG selection chrome: per-shape selection rects, plus the
 * four corner resize handles + rotation handle for a single resizable
 * selection. The enterprise hard-coded per-type opt-outs (connector,
 * flowarrow, c4node, sticky, screen) became the `selfRendersSelection`
 * ShapeUtil capability (#118) — utils that draw their own ring opt out
 * here.
 */
export const SelectionLayer: FC = () => {
  const instance = useCanvasInstance();
  const camera = useCanvasStore((s) => s.camera);
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const shapes = useCanvasStore((s) => s.shapes);
  const editingId = useCanvasStore((s) => s.editingId);
  const lens = useCanvasStore((s) => s.lens);

  if (selectedIds.size === 0) return null;

  const selected = [...selectedIds]
    .map((id) => shapes[id])
    .filter((s): s is Shape => s !== undefined);
  const singleShape = selected.length === 1 ? selected[0] : undefined;
  const canResizeSingle =
    singleShape !== undefined && instance.shapeUtils.get(singleShape.type)?.canResize(singleShape);

  return (
    <svg
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'visible',
      }}
    >
      {selected.map((shape) => {
        if (editingId === shape.id) return null;
        // Shapes that draw their own selection treatment (connector edge
        // highlight, sticky twin ring, C4 halo, …) skip the AABB rect.
        if (instance.shapeUtils.get(shape.type)?.selfRendersSelection?.(shape)) return null;
        const rot = shape.rotation ?? 0;
        const effPos = effectivePosition(shape, lens);
        const screenPos = pageToScreen({ x: effPos.x, y: effPos.y }, camera);
        const screenCenter = pageToScreen(
          { x: effPos.x + shape.width / 2, y: effPos.y + shape.height / 2 },
          camera,
        );
        const w = shape.width * camera.zoom;
        const h = shape.height * camera.zoom;
        return (
          <g
            key={shape.id}
            transform={`rotate(${String(rot)}, ${String(screenCenter.x)}, ${String(screenCenter.y)})`}
          >
            <rect
              x={screenPos.x}
              y={screenPos.y}
              width={w}
              height={h}
              fill="none"
              style={{ stroke: 'var(--accent)' }}
              strokeWidth={2}
            />
          </g>
        );
      })}
      {canResizeSingle === true &&
        singleShape !== undefined &&
        editingId !== singleShape.id &&
        (() => {
          const rot = singleShape.rotation ?? 0;
          const effPos = effectivePosition(singleShape, lens);
          const screenPos = pageToScreen({ x: effPos.x, y: effPos.y }, camera);
          const screenCenter = pageToScreen(
            { x: effPos.x + singleShape.width / 2, y: effPos.y + singleShape.height / 2 },
            camera,
          );
          const w = singleShape.width * camera.zoom;
          const h = singleShape.height * camera.zoom;
          const corners = [
            { cx: screenPos.x, cy: screenPos.y, cursor: 'nwse-resize' },
            { cx: screenPos.x + w, cy: screenPos.y, cursor: 'nesw-resize' },
            { cx: screenPos.x, cy: screenPos.y + h, cursor: 'nesw-resize' },
            { cx: screenPos.x + w, cy: screenPos.y + h, cursor: 'nwse-resize' },
          ];
          return (
            <g
              transform={`rotate(${String(rot)}, ${String(screenCenter.x)}, ${String(screenCenter.y)})`}
            >
              <line
                x1={screenPos.x + w / 2}
                y1={screenPos.y}
                x2={screenPos.x + w / 2}
                y2={screenPos.y - ROTATION_OFFSET}
                style={{ stroke: 'var(--accent)' }}
                strokeWidth={1.5}
              />
              <circle
                cx={screenPos.x + w / 2}
                cy={screenPos.y - ROTATION_OFFSET}
                r={HANDLE_R}
                fill="var(--bg-elevated)"
                strokeWidth={2}
                style={{ stroke: 'var(--accent)', cursor: 'grab', pointerEvents: 'all' }}
              />
              {corners.map((corner, i) => (
                <circle
                  key={i}
                  cx={corner.cx}
                  cy={corner.cy}
                  r={HANDLE_R}
                  fill="var(--bg-elevated)"
                  strokeWidth={2}
                  style={{ stroke: 'var(--accent)', cursor: corner.cursor, pointerEvents: 'all' }}
                />
              ))}
            </g>
          );
        })()}
    </svg>
  );
};
