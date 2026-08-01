import { useCallback } from 'react';
import { useCanvasInstance, useCanvasStore } from '../canvas-provider.js';
import { useCanvasViewport } from '../canvas-viewport.js';
import { effectivePosition } from '../utils/lens.js';
import type { Camera } from '../types.js';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;
const FIT_PAD = 80;

/**
 * Camera that frames every shape centred within `viewport` (canvas
 * pixels), with padding. Pure — used by both the live `zoomToFit` and
 * image-export flows (which fit, capture, then restore the previous
 * camera). Empty → identity.
 */
export function computeFitCamera(
  shapes: Record<string, { x: number; y: number; width: number; height: number }>,
  viewport: { width: number; height: number },
  pad = FIT_PAD,
): Camera {
  const list = Object.values(shapes);
  if (list.length === 0) return { x: 0, y: 0, zoom: 1 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of list) {
    minX = Math.min(minX, s.x);
    minY = Math.min(minY, s.y);
    maxX = Math.max(maxX, s.x + s.width);
    maxY = Math.max(maxY, s.y + s.height);
  }
  const contentW = maxX - minX || 1;
  const contentH = maxY - minY || 1;
  const zoom = Math.min(
    MAX_ZOOM,
    Math.max(
      MIN_ZOOM,
      Math.min((viewport.width - pad * 2) / contentW, (viewport.height - pad * 2) / contentH),
    ),
  );
  return {
    zoom,
    x: (minX + maxX) / 2 - viewport.width / 2 / zoom,
    y: (minY + maxY) / 2 - viewport.height / 2 / zoom,
  };
}

/**
 * The camera controller: cursor-anchored wheel zoom, fixed-factor button
 * zoom, reset and zoom-to-fit. All screen coordinates are CANVAS-relative
 * pixels; `zoomToFit`'s default frame is the enclosing `<Canvas>`'s
 * measured viewport (the seam replacing the enterprise window-inner-size
 * fallback — issue #117), so it no-ops when no viewport is measurable and
 * none is passed explicitly.
 */
export function useCamera(): {
  zoomAround: (screenX: number, screenY: number, delta: number) => void;
  zoomByFactor: (factor: number, screenX: number, screenY: number) => void;
  resetZoom: () => void;
  zoomToFit: (viewport?: { width: number; height: number }) => void;
  handleWheel: (e: WheelEvent) => void;
} {
  const instance = useCanvasInstance();
  const setCamera = useCanvasStore((s) => s.setCamera);
  const camera = useCanvasStore((s) => s.camera);
  const measuredViewport = useCanvasViewport();

  const zoomAround = useCallback(
    (screenX: number, screenY: number, delta: number) => {
      const factor = Math.pow(0.999, delta);
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, camera.zoom * factor));
      const pageX = screenX / camera.zoom + camera.x;
      const pageY = screenY / camera.zoom + camera.y;
      setCamera({
        zoom: newZoom,
        x: pageX - screenX / newZoom,
        y: pageY - screenY / newZoom,
      });
    },
    [camera, setCamera],
  );

  // Zoom by a fixed factor (>1 in, <1 out) keeping the page point under
  // (screenX, screenY) — canvas-relative pixels — fixed. Used by the +/-
  // buttons (passing the canvas centre) so the view zooms around its middle.
  const zoomByFactor = useCallback(
    (factor: number, screenX: number, screenY: number) => {
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, camera.zoom * factor));
      const pageX = screenX / camera.zoom + camera.x;
      const pageY = screenY / camera.zoom + camera.y;
      setCamera({
        zoom: newZoom,
        x: pageX - screenX / newZoom,
        y: pageY - screenY / newZoom,
      });
    },
    [camera, setCamera],
  );

  const resetZoom = useCallback(() => {
    setCamera({ x: 0, y: 0, zoom: 1 });
  }, [setCamera]);

  // Frame all shapes centred in the viewport. `viewport` defaults to the
  // enclosing Canvas's measured rect so the fit centres within the canvas
  // (not the window) when sidebars are present. Uses effectivePosition so
  // structured lens offsets are fully framed. Single-pass bounds
  // calculation avoids building an intermediate map for all shapes.
  const zoomToFit = useCallback(
    (viewport?: { width: number; height: number }) => {
      const vp =
        viewport ??
        (measuredViewport && measuredViewport.width > 0 && measuredViewport.height > 0
          ? { width: measuredViewport.width, height: measuredViewport.height }
          : null);
      if (!vp) return;
      const { shapes, lens } = instance.getState();
      const list = Object.values(shapes);
      if (list.length === 0) {
        setCamera({ x: 0, y: 0, zoom: 1 });
        return;
      }
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const s of list) {
        const { x, y } = effectivePosition(s, lens);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + s.width);
        maxY = Math.max(maxY, y + s.height);
      }
      const contentW = maxX - minX || 1;
      const contentH = maxY - minY || 1;
      const zoom = Math.min(
        MAX_ZOOM,
        Math.max(
          MIN_ZOOM,
          Math.min((vp.width - FIT_PAD * 2) / contentW, (vp.height - FIT_PAD * 2) / contentH),
        ),
      );
      setCamera({
        zoom,
        x: (minX + maxX) / 2 - vp.width / 2 / zoom,
        y: (minY + maxY) / 2 - vp.height / 2 / zoom,
      });
    },
    [instance, measuredViewport, setCamera],
  );

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        // Translate the pointer to canvas-relative pixels: zoomAround's
        // math anchors on the canvas origin, and an embedded canvas does
        // not sit at the window origin.
        const rect = measuredViewport?.getRect() ?? null;
        zoomAround(e.clientX - (rect?.left ?? 0), e.clientY - (rect?.top ?? 0), e.deltaY);
      } else {
        const { camera: c } = instance.getState();
        setCamera({
          ...c,
          x: c.x + e.deltaX / c.zoom,
          y: c.y + e.deltaY / c.zoom,
        });
      }
    },
    [instance, measuredViewport, zoomAround, setCamera],
  );

  return { zoomAround, zoomByFactor, resetZoom, zoomToFit, handleWheel };
}
