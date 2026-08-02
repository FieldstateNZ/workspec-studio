import { memo, type FC } from 'react';
import { useCanvasInstance, useCanvasStore } from '../canvas-provider.js';
import { pageToScreen } from '../utils/transforms.js';
import type { Shape as ShapeType, ShapeId } from '../types.js';

interface Props {
  shape: ShapeType;
}

/**
 * Per-shape wrapper — ported from the enterprise components/Shape.tsx:
 * two-layer transform (outer = lens-offset translate with the 0.28s glide;
 * inner = camera translate3d + rotate + scale with `contain`), focus-mode
 * dimming (connectors follow their endpoints), highlight pulse ring and
 * recent-entry animation. Utils resolve from the instance registry.
 */
export const Shape: FC<Props> = memo(({ shape }) => {
  const instance = useCanvasInstance();
  const camera = useCanvasStore((s) => s.camera);
  const editingId = useCanvasStore((s) => s.editingId);
  const focusIds = useCanvasStore((s) => s.focusIds);
  const isHighlighted = useCanvasStore((s) => s.highlightIds.has(shape.id));
  const isRecent = useCanvasStore((s) => s.recentIds.has(shape.id));
  const lens = useCanvasStore((s) => s.lens);
  const isLensSwitching = useCanvasStore((s) => s.isLensSwitching);
  const isDragging = useCanvasStore((s) => s.isDragging);

  const util = instance.shapeUtils.get(shape.type);
  if (!util) return null;

  const isEditing = editingId === shape.id;
  const rot = shape.rotation ?? 0;
  const hw = shape.width / 2;
  const hh = shape.height / 2;

  // Outer transform uses raw x/y — camera pan/zoom/rotation/resize never transition.
  const screenCenter = pageToScreen({ x: shape.x + hw, y: shape.y + hh }, camera);

  // Focus mode dims everything outside the focus set; connectors follow
  // their endpoints (either end in focus keeps the edge legible).
  let dimmed = false;
  if (focusIds) {
    if (shape.type === 'connector') {
      const sourceShapeId = shape['sourceShapeId'] as ShapeId | null;
      const targetShapeId = shape['targetShapeId'] as ShapeId | null;
      const inFocus =
        (sourceShapeId !== null && focusIds.has(sourceShapeId)) ||
        (targetShapeId !== null && focusIds.has(targetShapeId));
      dimmed = !inFocus;
    } else {
      dimmed = !focusIds.has(shape.id);
    }
  }

  // Lens offset translated to screen coords so the inner wrapper stays scale-consistent.
  const lensOffset = lens === 'structured' ? shape.lensOffset : undefined;
  const lensOffsetScreenDx = lensOffset ? lensOffset.dx * camera.zoom : 0;
  const lensOffsetScreenDy = lensOffset ? lensOffset.dy * camera.zoom : 0;

  const ShapeComponent = util.Component;

  return (
    // Outer: lens-offset translate only — outside rotation/scale so the shift is a
    // pure screen-space vector (lensOffset.dx × zoom) that matches effectivePosition().
    // The glide transition lives here so camera/rotation/resize never animate.
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: shape.width,
        height: shape.height,
        transform:
          lensOffsetScreenDx !== 0 || lensOffsetScreenDy !== 0
            ? `translate3d(${String(lensOffsetScreenDx)}px, ${String(lensOffsetScreenDy)}px, 0)`
            : undefined,
        transition: isLensSwitching && !isDragging ? 'transform 0.28s ease' : undefined,
      }}
    >
      {/* Inner: camera + rotation + scale — never transitions. */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: shape.width,
          height: shape.height,
          transform: `translate3d(${String(screenCenter.x)}px, ${String(screenCenter.y)}px, 0) rotate(${String(rot)}deg) scale(${String(camera.zoom)}) translate(${String(-hw)}px, ${String(-hh)}px)`,
          transformOrigin: '0 0',
          contain: 'layout style size',
          pointerEvents: isEditing ? 'auto' : 'none',
          opacity: dimmed ? 0.15 : 1,
          transition: focusIds !== null || dimmed ? 'opacity 200ms ease' : undefined,
          animation: isRecent ? 'canvas-shape-enter 600ms ease-out' : undefined,
        }}
      >
        {isHighlighted && (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: -8,
              borderRadius: 12,
              border: '2px solid var(--accent)',
              animation: 'canvas-highlight-pulse 1.2s ease-out infinite',
              pointerEvents: 'none',
            }}
          />
        )}
        <ShapeComponent shape={shape} isEditing={isEditing} />
      </div>
    </div>
  );
});

Shape.displayName = 'Shape';
