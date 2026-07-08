import { describe, expect, it } from 'vitest';
import { IDENTITY_CAMERA, clampZoom, panBy, zoomAt } from './camera.js';

describe('clampZoom', () => {
  it('clamps below the minimum', () => {
    expect(clampZoom(0.01)).toBe(0.25);
  });
  it('clamps above the maximum', () => {
    expect(clampZoom(100)).toBe(4);
  });
  it('passes an in-range value through unchanged', () => {
    expect(clampZoom(1.5)).toBe(1.5);
  });
});

describe('panBy', () => {
  it('translates x/y and leaves zoom untouched', () => {
    expect(panBy({ x: 10, y: 20, zoom: 2 }, 5, -5)).toEqual({ x: 15, y: 15, zoom: 2 });
  });
});

describe('zoomAt', () => {
  it('keeps the content-space point under the cursor visually fixed when zooming in', () => {
    const cursor = { x: 100, y: 100 };
    const next = zoomAt(IDENTITY_CAMERA, cursor, 2);
    expect(next.zoom).toBe(2);
    // Content point under the cursor before zoom: (100,100) (identity camera). After
    // zooming, that same content point must still render at (100,100).
    const renderedX = next.x + 100 * next.zoom;
    const renderedY = next.y + 100 * next.zoom;
    expect(renderedX).toBeCloseTo(cursor.x);
    expect(renderedY).toBeCloseTo(cursor.y);
  });

  it('is a no-op when already clamped at the limit', () => {
    const atMax = { x: 0, y: 0, zoom: 4 };
    expect(zoomAt(atMax, { x: 0, y: 0 }, 2)).toEqual(atMax);
  });

  it('zooming out also preserves the cursor point', () => {
    const camera = { x: -50, y: -50, zoom: 2 };
    const cursor = { x: 150, y: 150 };
    const next = zoomAt(camera, cursor, 0.5);
    const px = (cursor.x - camera.x) / camera.zoom;
    const py = (cursor.y - camera.y) / camera.zoom;
    expect(next.x + px * next.zoom).toBeCloseTo(cursor.x);
    expect(next.y + py * next.zoom).toBeCloseTo(cursor.y);
  });
});
