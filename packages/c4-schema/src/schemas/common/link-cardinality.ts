import { z } from 'zod';

/** The relationship-multiplicity values a link cardinality end may take. */
export const CARDINALITY_VALUES = ['0..1', '1', '1..1', '0..*', '1..*'] as const;

/**
 * The optional `cardinality` key a links entry may carry alongside its
 * single `{<linkType>: <pathRef>}` pair (used by relationship-style links
 * such as `entity-relates-to-entity`). Mirrors Enterprise's
 * `linkCardinalitySchema` in `lib/yaml-schemas/src/common.ts`.
 */
export const LinkCardinality = z
  .object({
    from: z.enum(CARDINALITY_VALUES).describe('Multiplicity at the source end, e.g. "1".'),
    to: z.enum(CARDINALITY_VALUES).describe('Multiplicity at the target end, e.g. "0..*".'),
    label: z
      .string()
      .optional()
      .describe('Optional human-readable relationship label, e.g. "owns".'),
  })
  .strict()
  .describe('Relationship cardinality carried on a links entry.');

/** Inferred type of a link cardinality. */
export type LinkCardinality = z.infer<typeof LinkCardinality>;
