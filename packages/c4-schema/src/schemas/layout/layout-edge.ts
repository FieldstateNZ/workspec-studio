import { z } from 'zod';

/** A single point along an edge's routed path, page coords. */
export const LayoutWaypoint = z
  .object({
    x: z.number().describe('X coordinate, top-left page coords.'),
    y: z.number().describe('Y coordinate, top-left page coords.'),
  })
  .strict()
  .describe('A single waypoint along a routed edge.');

/** Inferred type of a layout waypoint. */
export type LayoutWaypoint = z.infer<typeof LayoutWaypoint>;

/**
 * Optional routing hint for one diagram edge. Enterprise persists no
 * per-edge routing today (edge geometry is fully re-derived each render) —
 * this is new surface for the standalone `.layout/` format, kept minimal:
 * a single waypoint list, no per-waypoint styling. Keyed in the parent
 * `edges` map by `"<from>-><to>"`; when a diagram has parallel edges
 * between the same pair of nodes, v1 has them share the one routing hint
 * rather than disambiguating further.
 */
export const LayoutEdge = z
  .object({
    waypoints: z.array(LayoutWaypoint).describe('Ordered points the edge is routed through.'),
  })
  .strict()
  .describe('Routing hint for one diagram edge.');

/** Inferred type of a layout edge routing hint. */
export type LayoutEdge = z.infer<typeof LayoutEdge>;
