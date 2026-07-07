import { z } from 'zod';

/**
 * A pinned node position in a thin diagram file, in top-left page
 * coordinates. Present only when an author has manually placed a node
 * inline in the diagram YAML — the more common way to pin positions is a
 * sibling `.layout/` file, which this package also models separately.
 */
export const DiagramPosition = z
  .object({
    x: z.number().describe('X coordinate, top-left page coords.'),
    y: z.number().describe('Y coordinate, top-left page coords.'),
  })
  .strict()
  .describe('A pinned node position, top-left page coords.');

/** Inferred type of a diagram node position. */
export type DiagramPosition = z.infer<typeof DiagramPosition>;
