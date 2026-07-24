import { z } from 'zod';

/** A single point along a connection's routed path, page coords. */
export const LayoutWaypoint = z
  .object({
    x: z.number().describe('X coordinate, top-left page coords.'),
    y: z.number().describe('Y coordinate, top-left page coords.'),
  })
  .strict()
  .describe('A single waypoint along a routed connection.');

/** Inferred type of a layout waypoint. */
export type LayoutWaypoint = z.infer<typeof LayoutWaypoint>;

/**
 * Optional routing hint for one topology connection. Mirrors
 * `@workspec/c4-schema`'s `LayoutEdge` exactly: a single waypoint list, no
 * per-waypoint styling. Keyed in the parent `edges` map by `"<from>-><to>"`;
 * when a topology has parallel connections between the same pair of
 * resources, they share the one routing hint rather than disambiguating
 * further.
 */
export const LayoutEdge = z
  .object({
    waypoints: z.array(LayoutWaypoint).describe('Ordered points the connection is routed through.'),
  })
  .strict()
  .describe('Routing hint for one topology connection.');

/** Inferred type of a layout edge routing hint. */
export type LayoutEdge = z.infer<typeof LayoutEdge>;
