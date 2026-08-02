import { useRef, type FC, type PointerEvent as ReactPointerEvent } from 'react';
import { useCanvasInstance, useCanvasStore } from '../canvas-provider.js';
import { useCanvasViewport } from '../canvas-viewport.js';
import type { Camera, Shape } from '../types.js';

const PANEL_W = 192;
const PANEL_H = 128;
const PADDING = 80;

// World bounding box of all non-connector shapes, with padding.
function worldBounds(shapes: Shape[]): { x: number; y: number; w: number; h: number } {
  if (shapes.length === 0) return { x: 0, y: 0, w: 800, h: 600 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of shapes) {
    minX = Math.min(minX, s.x);
    minY = Math.min(minY, s.y);
    maxX = Math.max(maxX, s.x + s.width);
    maxY = Math.max(maxY, s.y + s.height);
  }
  return {
    x: minX - PADDING,
    y: minY - PADDING,
    w: Math.max(1, maxX - minX + PADDING * 2),
    h: Math.max(1, maxY - minY + PADDING * 2),
  };
}

interface WorldRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Projection {
  scale: number;
  offsetX: number;
  offsetY: number;
}

// Scale factor and offsets to letterbox worldRect into the panel while
// preserving aspect ratio.
function computeProjection(wb: WorldRect): Projection {
  const scaleX = PANEL_W / wb.w;
  const scaleY = PANEL_H / wb.h;
  const scale = Math.min(scaleX, scaleY);
  const projW = wb.w * scale;
  const projH = wb.h * scale;
  const offsetX = (PANEL_W - projW) / 2;
  const offsetY = (PANEL_H - projH) / 2;
  return { scale, offsetX, offsetY };
}

// Project a world rect into minimap panel coordinates.
function projectRect(
  wx: number,
  wy: number,
  ww: number,
  wh: number,
  wb: WorldRect,
  proj: Projection,
): { x: number; y: number; w: number; h: number } {
  const x = (wx - wb.x) * proj.scale + proj.offsetX;
  const y = (wy - wb.y) * proj.scale + proj.offsetY;
  const w = Math.max(2, ww * proj.scale);
  const h = Math.max(2, wh * proj.scale);
  return { x, y, w, h };
}

// Current visible world rectangle from camera + viewport size.
function viewportWorldRect(camera: Camera, vpW: number, vpH: number): WorldRect {
  return {
    x: camera.x,
    y: camera.y,
    w: vpW / camera.zoom,
    h: vpH / camera.zoom,
  };
}

// Convert a minimap panel point back to world coordinates.
function panelToWorld(
  panelX: number,
  panelY: number,
  wb: WorldRect,
  proj: Projection,
): { x: number; y: number } {
  return {
    x: (panelX - proj.offsetX) / proj.scale + wb.x,
    y: (panelY - proj.offsetY) / proj.scale + wb.y,
  };
}

/** Props for {@link Minimap}. */
export interface MinimapProps {
  /**
   * kind → fill colour for the shape dots, matched via the instance's
   * `kindResolver`. The enterprise imported its app-level ARTIFACT_COLORS
   * map here; the package takes it injected (#118). Unmapped kinds fall
   * back to `var(--line)`.
   */
  kindColors?: Record<string, string>;
}

/**
 * SVG minimap: world-bounds letterbox projection, click-to-centre,
 * drag-the-viewport-box. Hidden below 2 visible shapes. The viewport rect
 * derives from the enclosing Canvas's MEASURED size (enterprise used
 * `window.inner*`); panel chrome uses design tokens instead of the
 * enterprise Tailwind app-theme classes (deviations logged).
 */
export const Minimap: FC<MinimapProps> = ({ kindColors = {} }) => {
  const instance = useCanvasInstance();
  const shapes = useCanvasStore((s) => s.shapes);
  const camera = useCanvasStore((s) => s.camera);
  const setCamera = useCanvasStore((s) => s.setCamera);
  const setViewportIntent = useCanvasStore((s) => s.setViewportIntent);
  const hiddenKinds = useCanvasStore((s) => s.hiddenKinds);
  const viewport = useCanvasViewport();
  const kindOf = instance.kindResolver;

  const panelRef = useRef<HTMLDivElement>(null);
  // Drag-the-viewport state: whether the initial pointerdown landed inside
  // the viewport box, and the last pointer position in panel coords.
  const dragRef = useRef<{ isDragging: boolean; lastPanelX: number; lastPanelY: number } | null>(
    null,
  );

  const nonConnectors = Object.values(shapes).filter(
    (s) => s.type !== 'connector' && (hiddenKinds.size === 0 || !hiddenKinds.has(kindOf(s))),
  );

  // Hide when there are fewer than 2 visible shapes or no measured viewport.
  if (nonConnectors.length < 2) return null;
  if (!viewport || viewport.width === 0 || viewport.height === 0) return null;

  const vpW = viewport.width;
  const vpH = viewport.height;
  const wb = worldBounds(nonConnectors);
  const proj = computeProjection(wb);
  const vpr = viewportWorldRect(camera, vpW, vpH);
  const vpProjRect = projectRect(vpr.x, vpr.y, vpr.w, vpr.h, wb, proj);

  const panelPointFromEvent = (e: ReactPointerEvent): { px: number; py: number } => {
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return { px: 0, py: 0 };
    return { px: e.clientX - rect.left, py: e.clientY - rect.top };
  };

  // Centre the camera on a world point while preserving zoom.
  const centreOn = (worldX: number, worldY: number): void => {
    setViewportIntent('custom');
    setCamera({
      zoom: camera.zoom,
      x: worldX - vpW / 2 / camera.zoom,
      y: worldY - vpH / 2 / camera.zoom,
    });
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    e.stopPropagation();
    const { px, py } = panelPointFromEvent(e);

    // Is the pointer inside the projected viewport box?
    const insideVpBox =
      px >= vpProjRect.x &&
      px <= vpProjRect.x + vpProjRect.w &&
      py >= vpProjRect.y &&
      py <= vpProjRect.y + vpProjRect.h;

    if (insideVpBox) {
      // Begin dragging the viewport box.
      dragRef.current = { isDragging: true, lastPanelX: px, lastPanelY: py };
      e.currentTarget.setPointerCapture(e.pointerId);
    } else {
      // Click outside the viewport box → centre on that world point.
      const world = panelToWorld(px, py, wb, proj);
      centreOn(world.x, world.y);
    }
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;
    if (!drag?.isDragging) return;
    const { px, py } = panelPointFromEvent(e);
    const dx = px - drag.lastPanelX;
    const dy = py - drag.lastPanelY;
    drag.lastPanelX = px;
    drag.lastPanelY = py;

    // Convert minimap delta to world delta, then pan camera.
    const worldDx = dx / proj.scale;
    const worldDy = dy / proj.scale;
    setViewportIntent('custom');
    setCamera({
      zoom: camera.zoom,
      x: camera.x + worldDx,
      y: camera.y + worldDy,
    });
  };

  const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>): void => {
    dragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <div
      ref={panelRef}
      data-canvas-ui
      data-export-exclude
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        position: 'absolute',
        bottom: 16,
        right: 16,
        width: PANEL_W,
        height: PANEL_H,
        zIndex: 10,
        cursor: 'crosshair',
        pointerEvents: 'auto',
        borderRadius: 8,
        border: '1px solid var(--line)',
        background: 'color-mix(in oklab, var(--bg) 95%, transparent)',
        backdropFilter: 'blur(8px)',
        boxShadow: 'var(--sh-3)',
        overflow: 'hidden',
      }}
    >
      <svg
        width={PANEL_W}
        height={PANEL_H}
        style={{ display: 'block', pointerEvents: 'none' }}
        aria-hidden
      >
        {/* Shape dots */}
        {nonConnectors.map((shape) => {
          const kind = kindOf(shape);
          const color = kindColors[kind] ?? 'var(--line)';
          const r = projectRect(shape.x, shape.y, shape.width, shape.height, wb, proj);
          return (
            <rect
              key={shape.id}
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.h}
              rx={2}
              ry={2}
              fill={color}
              opacity={0.7}
            />
          );
        })}

        {/* Viewport rectangle */}
        <rect
          x={vpProjRect.x}
          y={vpProjRect.y}
          width={Math.max(4, vpProjRect.w)}
          height={Math.max(4, vpProjRect.h)}
          rx={2}
          ry={2}
          fill="var(--accent)"
          fillOpacity={0.08}
          stroke="var(--accent)"
          strokeWidth={1.5}
        />
      </svg>
    </div>
  );
};
