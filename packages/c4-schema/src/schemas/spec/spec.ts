import { z } from 'zod';
import { sourceField } from '../common/source-field.js';
import { StyleConnection } from './style-connection.js';
import { StyleElement } from './style-element.js';
import { StyleSurfaceSet } from './style-surface-set.js';

/**
 * The singleton style spec artifact at `.workspec/spec.yaml`. Deliberately
 * lenient, mirroring Enterprise's `StyleSpecYamlSchema` in
 * `lib/yaml-schemas/src/spec.ts`: `type`/`version` are optional free
 * values (v2 files say `type: style`, `version: 2`; legacy files said
 * `type: spec` and still parse), unknown top-level keys pass through, and
 * `elements`/`connections` default to empty maps — Enterprise ships code
 * defaults for every kind and category, so an absent or empty spec still
 * renders. The style compiler owns normalising + warning about legacy or
 * unknown values; this schema never hard-fails on them.
 */
export const Spec = z
  .looseObject({
    type: z
      .string()
      .optional()
      .describe('Artifact kind label: "style" (v2). Legacy files used "spec" — still accepted; the compiler upgrades.'),
    version: z.number().optional().describe('Style spec format version. Current is 2.'),
    surfaces: z
      .object({
        light: StyleSurfaceSet.optional().describe('Surface colors for the light theme.'),
        dark: StyleSurfaceSet.optional().describe('Surface colors for the dark theme.'),
      })
      .optional()
      .describe('Optional per-theme surface/ink/page color overrides.'),
    elements: z
      .record(z.string(), StyleElement)
      .default({})
      .describe('Per-element-kind visual style, keyed by kind name. Absent kinds use code defaults.'),
    connections: z
      .record(z.string(), StyleConnection)
      .default({})
      .describe('Per-category edge visual style, keyed by category name. Absent categories use code defaults.'),
    source: sourceField,
  })
  .describe('The singleton project style spec (lenient; the style compiler normalises).');

/** Inferred type of the style spec. */
export type Spec = z.infer<typeof Spec>;
