import { z } from 'zod';

/**
 * The line-style values the renderer resolves to. Documentation only at
 * the authored layer — the raw spec accepts any string (per Enterprise's
 * `rawConnectionStyleSchema`).
 */
export const STYLE_CONNECTION_STYLES = ['solid', 'dashed'] as const;

/**
 * The authored visual style for one edge category under `spec.yaml`'s
 * `connections` map. Built-in categories in Enterprise: `interaction`,
 * `data`, `governance`, `identity` — but the map is open, keyed by any
 * category string an edge's `category` field references. Deliberately
 * lenient like `StyleElement`: optional free strings, unknown keys pass
 * through for the style compiler to inspect.
 */
export const StyleConnection = z
  .looseObject({
    accent: z.string().optional().describe('Accent color, e.g. "#64748b".'),
    style: z.string().optional().describe('Rendered line style. Known values: "solid", "dashed".'),
  })
  .describe('Authored visual style for one edge category (lenient; the style compiler normalises).');

/** Inferred type of one connection style entry. */
export type StyleConnection = z.infer<typeof StyleConnection>;
