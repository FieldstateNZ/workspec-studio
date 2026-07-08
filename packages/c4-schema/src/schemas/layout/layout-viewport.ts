import { z } from 'zod';

/**
 * Persisted camera state for a diagram, graduating Enterprise's
 * `diagram_layouts.viewport` column into the standalone `.layout/` format.
 * `zoom` must be strictly positive — zero or negative zoom has no
 * renderable meaning.
 */
export const LayoutViewport = z
  .object({
    x: z.number().describe('Camera X offset, page coords.'),
    y: z.number().describe('Camera Y offset, page coords.'),
    zoom: z.number().positive().describe('Camera zoom factor; must be greater than zero.'),
  })
  .strict()
  .describe('Persisted camera state for a diagram.');

/** Inferred type of a layout viewport. */
export type LayoutViewport = z.infer<typeof LayoutViewport>;
