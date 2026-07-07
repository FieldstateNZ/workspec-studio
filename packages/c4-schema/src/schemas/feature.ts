import { z } from 'zod';
import { linksField } from './common/links-field.js';
import { sourceField } from './common/source-field.js';

/**
 * A feature element: C4 "component" in WorkSpec vocabulary — a unit of
 * functionality within a domain. Lives at `.workspec/features/<slug>.yaml`.
 * `description` is required but, unlike most other element kinds, not
 * length-constrained (an empty string parses), matching Enterprise's
 * `FeatureYamlSchema` in `lib/yaml-schemas/src/feature.ts`. There is no
 * `tags` field on this kind.
 */
export const FeatureElement = z
  .object({
    title: z.string().describe('Human-readable name of the feature.'),
    description: z.string().describe('What this feature does. Required; may be empty.'),
    links: linksField,
    source: sourceField,
  })
  .strict()
  .describe('A feature element: a unit of functionality within a domain (C4 "component").');

/** Inferred type of a feature element. */
export type FeatureElement = z.infer<typeof FeatureElement>;
