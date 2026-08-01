import type { Vec2, Camera } from '../types.js';

/** Page → screen: translate by the camera origin, then scale by zoom. */
export const pageToScreen = (p: Vec2, camera: Camera): Vec2 => ({
  x: (p.x - camera.x) * camera.zoom,
  y: (p.y - camera.y) * camera.zoom,
});

/** Screen → page: the exact inverse of `pageToScreen`. */
export const screenToPage = (s: Vec2, camera: Camera): Vec2 => ({
  x: s.x / camera.zoom + camera.x,
  y: s.y / camera.zoom + camera.y,
});
