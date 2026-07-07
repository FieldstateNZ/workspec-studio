import type { ResolvedDiagramEdge } from '@workspec/c4-model';

/**
 * The `.layout/` edge-hint key for one edge: `"<from>-><to>"`, matching
 * `LayoutEdge`'s `edges` record key format exactly (see
 * `@workspec/c4-schema`'s `layout-edge.ts`). Parallel edges between the
 * same node pair share one key — `@workspec/c4-model`'s own layout-join
 * step already treats that as the v1 simplification (a routing hint applies
 * to every edge between that pair), so this package inherits the same
 * behaviour rather than inventing per-edge disambiguation.
 */
export function edgeKey(edge: Pick<ResolvedDiagramEdge, 'from' | 'to'>): string {
  return `${edge.from}->${edge.to}`;
}
