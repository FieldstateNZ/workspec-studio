import { z } from 'zod';

/**
 * One theme's surface colors in the style spec's `surfaces` block: the
 * neutral node surface, its ink (text) color, and the page background.
 * All optional — the renderer fills anything omitted from its theme
 * defaults. Mirrors Enterprise's `surfaceSetSchema` in
 * `lib/yaml-schemas/src/spec.ts`.
 */
export const StyleSurfaceSet = z
  .object({
    surface: z.string().optional().describe('Node surface color for this theme.'),
    ink: z.string().optional().describe('Text/ink color used on the surface.'),
    page: z.string().optional().describe('Page (canvas) background color.'),
  })
  .describe("One theme's surface, ink, and page colors.");

/** Inferred type of one theme's surface set. */
export type StyleSurfaceSet = z.infer<typeof StyleSurfaceSet>;
