import { describe, expect, it } from 'vitest';
import { layoutFactory } from '../../../test/helpers/factories.js';
import { Layout } from './layout.js';

describe('Layout', () => {
  it('accepts an empty nodes map (no pinned nodes -> full auto-layout)', () => {
    const result = Layout.safeParse(layoutFactory());
    expect(result.success).toBe(true);
  });

  it('accepts pinned nodes, edge waypoint hints, and a viewport together', () => {
    const result = Layout.safeParse(
      layoutFactory({
        nodes: {
          architect: { x: 80, y: 200, width: 240, height: 120 },
          __system__: { x: 400, y: 200 },
        },
        edges: { 'architect->__system__': { waypoints: [{ x: 200, y: 220 }, { x: 300, y: 220 }] } },
        viewport: { x: 0, y: 0, zoom: 1 },
      }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects a wrong version number', () => {
    const result = Layout.safeParse({ ...layoutFactory(), version: 2 });
    expect(result.success).toBe(false);
  });

  it('rejects a non-positive viewport zoom', () => {
    const result = Layout.safeParse(layoutFactory({ viewport: { x: 0, y: 0, zoom: 0 } }));
    expect(result.success).toBe(false);
  });

  it('rejects a negative viewport zoom', () => {
    const result = Layout.safeParse(layoutFactory({ viewport: { x: 0, y: 0, zoom: -1 } }));
    expect(result.success).toBe(false);
  });

  it('rejects a string-typed node coordinate', () => {
    const result = Layout.safeParse({
      ...layoutFactory(),
      nodes: { architect: { x: '80', y: 200 } },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing nodes map', () => {
    const result = Layout.safeParse({ version: 1 });
    expect(result.success).toBe(false);
  });
});
