import { z } from 'zod';

/**
 * A pinned node's position (and optionally size) within a `.layout/` file.
 * Presence of an entry pins that element; absence means auto-layout picks
 * its position. Coordinates are top-left page coords, matching Enterprise's
 * `diagram_layouts.nodePositions`. `width`/`height` have no Enterprise
 * counterpart (all C4 nodes there are a fixed 300x110) — they're included
 * here because a standalone layout format shouldn't hard-code node
 * dimensions the way an embedded canvas can.
 */
export const LayoutNode = z
  .object({
    x: z.number().describe('X coordinate, top-left page coords.'),
    y: z.number().describe('Y coordinate, top-left page coords.'),
    width: z
      .number()
      .positive()
      .optional()
      .describe('Optional pinned node width. Omit to use the renderer default.'),
    height: z
      .number()
      .positive()
      .optional()
      .describe('Optional pinned node height. Omit to use the renderer default.'),
  })
  .strict()
  .describe('A pinned node position and optional size.');

/** Inferred type of a pinned layout node. */
export type LayoutNode = z.infer<typeof LayoutNode>;
