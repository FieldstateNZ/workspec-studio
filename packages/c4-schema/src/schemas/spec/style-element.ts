import { z } from 'zod';

/**
 * The shape values the renderer resolves to. Documentation only at the
 * authored layer — the raw spec accepts any string so legacy/unknown
 * values still parse and the style compiler normalises + warns instead of
 * hard-failing (per Enterprise's `rawElementStyleSchema`).
 */
export const STYLE_SHAPES = ['box', 'cylinder', 'pill', 'hexagon'] as const;

/**
 * The variant values the renderer resolves to. Documentation only at the
 * authored layer, same as `STYLE_SHAPES`.
 */
export const STYLE_ELEMENT_VARIANTS = ['external'] as const;

/**
 * The authored visual style for one element kind under `spec.yaml`'s
 * `elements` map. Deliberately lenient, mirroring Enterprise's
 * `rawElementStyleSchema` in `lib/yaml-schemas/src/spec.ts`: every field
 * is an optional free string (not an enum) and unknown keys pass through,
 * so v1-era specs (background-color / highlight-color / etc.) still parse
 * and the style compiler can normalise + warn rather than hard-fail.
 * Defaults exist in code for every key, so an absent entry still renders.
 */
export const StyleElement = z
  .looseObject({
    accent: z.string().optional().describe('Accent color, e.g. "#4A90D9" or "hsl(214 88% 51%)".'),
    icon: z.string().optional().describe('Icon name rendered on the node, e.g. "user", "database".'),
    shape: z
      .string()
      .optional()
      .describe('Rendered node shape. Known values: "box", "cylinder", "pill", "hexagon".'),
    variant: z
      .string()
      .nullish()
      .describe('Optional visual variant. Known values: "external" (external-system styling).'),
  })
  .describe('Authored visual style for one element kind (lenient; the style compiler normalises).');

/** Inferred type of one element style entry. */
export type StyleElement = z.infer<typeof StyleElement>;
