import { z } from 'zod';

/**
 * Shared `source` field carried by every C4 artifact (elements, diagrams,
 * and the style spec): a freeform provenance note (e.g. "imported from
 * OpenAPI spec", "generated from repo scan"). Mirrors Enterprise's
 * `sourceField` in `lib/yaml-schemas/src/common.ts` — a plain optional
 * string, deliberately not length-constrained. Optional — most
 * hand-authored artifacts have none.
 */
export const sourceField = z
  .string()
  .optional()
  .describe('Freeform provenance note: how or where this artifact was sourced from.');

/** Inferred type of the shared `source` field. */
export type SourceField = z.infer<typeof sourceField>;
