// Pan/zoom camera math for the interactive canvas. The canvas's outer `<svg
// viewBox>` is fixed to the diagram's `contentBounds`; a `<g transform=
// "translate(x,y) scale(zoom)">` inside it carries the pan/zoom camera state
// computed here. Pure functions, independent of any DOM/event plumbing, so
// the zoom-keeps-the-cursor-point-stable math is unit-testable without a
// real browser layout.

export interface Camera {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;

/** The identity camera: no pan, no zoom. */
export const IDENTITY_CAMERA: Camera = { x: 0, y: 0, zoom: 1 };

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** Pans the camera by a screen-space delta (already zoom-independent — callers scale a fixed step by `1 / camera.zoom` if they want constant-feeling keyboard panning). */
export function panBy(camera: Camera, dx: number, dy: number): Camera {
  return { ...camera, x: camera.x + dx, y: camera.y + dy };
}

/**
 * Zooms by `factor` (>1 zooms in, <1 zooms out), keeping the content-space
 * point under `cursor` (in the SAME coordinate space as the outer `viewBox`)
 * visually fixed — the standard "zoom toward the cursor" behaviour. `cursor`
 * is the point in the outer viewBox's own coordinates (already accounting
 * for any container scaling); the caller derives it from the pointer event
 * and the SVG's client rect.
 */
export function zoomAt(camera: Camera, cursor: { readonly x: number; readonly y: number }, factor: number): Camera {
  const nextZoom = clampZoom(camera.zoom * factor);
  if (nextZoom === camera.zoom) return camera;
  // The content-space point currently under the cursor: p = (cursor - camera) / zoom.
  const px = (cursor.x - camera.x) / camera.zoom;
  const py = (cursor.y - camera.y) / camera.zoom;
  // Solve for the new camera translate so that point still renders at `cursor`: cursor = camera' + p * nextZoom.
  return { x: cursor.x - px * nextZoom, y: cursor.y - py * nextZoom, zoom: nextZoom };
}
