import { describe, expect, it } from 'vitest';
import { Layout } from './layout.js';

function makeLayout(): { version: 1; nodes: Record<string, never> } {
  return { version: 1, nodes: {} };
}

describe('Layout', () => {
  it('accepts an empty nodes map (no pinned nodes -> full auto-layout)', () => {
    expect(Layout.safeParse(makeLayout()).success).toBe(true);
  });

  it('accepts a node pinned in both lenses, an edge waypoint hint, and a viewport', () => {
    const result = Layout.safeParse({
      version: 1,
      nodes: {
        'app-service': {
          positions: {
            network: { x: 80, y: 200, width: 240, height: 120 },
            rg: { x: 0, y: 0 },
          },
        },
        redis: {
          positions: { network: { x: 400, y: 200 } },
        },
      },
      edges: {
        'app-service->redis': {
          waypoints: [
            { x: 200, y: 220 },
            { x: 300, y: 220 },
          ],
        },
      },
      viewport: { x: 0, y: 0, zoom: 1 },
    });
    expect(result.success).toBe(true);
  });

  it('accepts a node pinned in only one lens', () => {
    const result = Layout.safeParse({
      version: 1,
      nodes: { 'app-service': { positions: { rg: { x: 0, y: 0 } } } },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a wrong version number', () => {
    expect(Layout.safeParse({ ...makeLayout(), version: 2 }).success).toBe(false);
  });

  it('rejects a non-positive viewport zoom', () => {
    expect(
      Layout.safeParse({ ...makeLayout(), viewport: { x: 0, y: 0, zoom: 0 } }).success,
    ).toBe(false);
  });

  it('rejects a string-typed node coordinate', () => {
    const result = Layout.safeParse({
      version: 1,
      nodes: { 'app-service': { positions: { network: { x: '80', y: 200 } } } },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing nodes map', () => {
    expect(Layout.safeParse({ version: 1 }).success).toBe(false);
  });

  it('rejects an unknown lens key under positions', () => {
    const result = Layout.safeParse({
      version: 1,
      nodes: { 'app-service': { positions: { bogus: { x: 0, y: 0 } } } },
    });
    expect(result.success).toBe(false);
  });
});
