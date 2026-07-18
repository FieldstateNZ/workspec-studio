import { z } from 'zod';
import { defineArtifact } from '@workspec/schema-core';

/**
 * The `Feature` spec (traceability spec §4.2): a thin container / grouping
 * edge that user- and system-requirements attach to. Lives at
 * `.workspec/features/<slug>.yaml`.
 *
 * Deliberately minimal — `name` plus an optional `product` scope, exactly the
 * spec's shape. This is `@workspec/req-schema`'s own `Feature` kind and is
 * distinct from `@workspec/c4-schema`'s `FeatureElement` (a C4 "component"):
 * same word, different model. No speculative fields.
 */
export const FeatureSpec = z
  .object({
    name: z.string().min(1).describe('Human-readable name of the feature.'),
    product: z
      .string()
      .optional()
      .describe('Product this feature belongs to, scoping it in a multi-product estate.'),
  })
  .describe('A feature: a thin container / grouping edge requirements attach to.');

/** A complete `Feature` artifact: the K8s-style envelope wrapping `FeatureSpec`. */
export const FeatureArtifact = defineArtifact('Feature', FeatureSpec);

/** Inferred type of the `Feature` spec body. */
export type FeatureSpec = z.infer<typeof FeatureSpec>;

/** Inferred type of a complete `Feature` artifact. */
export type Feature = z.infer<typeof FeatureArtifact>;
