import { z } from 'zod';
import { Slug } from './slug.js';

/**
 * Common `metadata` carried by every artifact `defineArtifact` builds.
 *
 * `slug` is optional: per the `.workspec/<kind-dir>/<slug>.yaml` convention,
 * the loader derives an artifact's slug from its filename (`slugFromPath`) —
 * there is no requirement to repeat it inside the file. When an author does
 * write it (e.g. to keep it visible without opening a directory listing, or
 * because tooling round-trips it), it must already be a valid slug so it
 * can't silently drift from the filename it's meant to describe.
 *
 * Deliberately left non-`.strict()` (unknown keys are silently stripped
 * rather than rejected): this is the one schema every shared and per-family
 * kind's envelope shares, so it needs room to grow common fields (e.g. a
 * future `labels`/`annotations`-style bag) without every existing consumer
 * needing to opt in at once. This mirrors `@workspec/cost-schema` and
 * `@workspec/decision-schema`'s own per-kind Metadata schemas, none of which
 * are `.strict()` either — only c4-schema's flat (non-enveloped) element
 * schemas use `.strict()`.
 */
export const MetadataSchema = z
  .object({
    slug: Slug.optional().describe(
      "Stable filename slug. Optional: the loader derives it from the artifact's filename " +
        'under `.workspec/<kind-dir>/<slug>.yaml` when absent; when present it must already be ' +
        'a valid slug.',
    ),
  })
  .describe('Common artifact identity shared by every schema-core-based kind.');

/** Inferred type of the common artifact metadata. */
export type Metadata = z.infer<typeof MetadataSchema>;
