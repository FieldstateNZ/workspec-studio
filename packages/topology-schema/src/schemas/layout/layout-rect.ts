import { z } from 'zod';

/**
 * A pinned position (and optionally size) within one lens of a `.layout/`
 * file. Coordinates are top-left page coords, matching
 * `@workspec/c4-schema`'s `LayoutNode` shape field-for-field
 * (`x`/`y`/`width`/`height`) — the only divergence from c4 is that a
 * topology layout node carries one of these per lens (see
 * `TopologyLayoutNode`) rather than a single position; keeping the field
 * names identical to c4's avoids a cross-family name mapping downstream.
 */
export const LayoutRect = z
  .object({
    x: z.number().describe('X coordinate, top-left page coords.'),
    y: z.number().describe('Y coordinate, top-left page coords.'),
    width: z
      .number()
      .positive()
      .optional()
      .describe('Optional pinned width. Omit to use the renderer default.'),
    height: z
      .number()
      .positive()
      .optional()
      .describe('Optional pinned height. Omit to use the renderer default.'),
  })
  .strict()
  .describe('A pinned position and optional size within one lens.');

/** Inferred type of a pinned layout rect. */
export type LayoutRect = z.infer<typeof LayoutRect>;
