import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkNode } from 'elkjs/lib/elk-api.js';
import type { LayoutPoint } from '../geometry/point.js';

/**
 * Runs one elkjs `layered` pass and returns each node's auto-computed
 * top-left position, keyed by node id. Imports the plain bundled build
 * (`elkjs/lib/elk.bundled.js`), never `elk-api.js` + a `workerUrl` — the
 * web-worker path needs the optional `web-worker` package (unavailable in a
 * browser-worker context anyway) and adds nothing this package needs: a
 * single synchronous-per-call layout of a few dozen nodes doesn't justify
 * off-thread execution. A fresh `ELK` instance per call (rather than one
 * shared instance) is deliberate: it's what the determinism test proves —
 * identical input produces identical output even across separate ELK
 * instances, so callers never need to worry about instance reuse.
 */
export async function runAutoLayout(graph: ElkNode): Promise<ReadonlyMap<string, LayoutPoint>> {
  const elk = new ELK();
  const result = await elk.layout(graph);
  const positions = new Map<string, LayoutPoint>();

  for (const child of result.children ?? []) {
    positions.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 });
  }

  return positions;
}
