import { z } from 'zod';
import { API_VERSION } from '../constants.js';
import { MetadataSchema } from './common/metadata.js';

/**
 * Builds the K8s-style envelope every WorkSpec artifact kind shares:
 * `{ apiVersion, kind, metadata, spec }`. `apiVersion` and `kind` are fixed
 * literals (the schema family's version discriminant and this kind's own
 * name), `metadata` is the common identity object (`MetadataSchema`), and
 * `spec` is whatever shape the caller passes in — the kind-specific body.
 *
 * This is the one place the envelope shape is defined; every shared kind in
 * this package (Actor) builds on it. `@workspec/cost-schema` and
 * `@workspec/decision-schema` still hand-roll their own four-field wrappers
 * and key identity on a required `metadata.id`; adopting this helper is part
 * of their planned migration to the canonical `metadata.slug` identity
 * (`.workspec/<kind>/<slug>.yaml`), not a drop-in. `metadata` here is fixed to
 * the slug-based `MetadataSchema` by design — a single canonical identity
 * shape is the whole point of the unification, so this helper does not accept
 * a per-family metadata override.
 *
 * Left non-`.strict()` at the envelope level too, consistent with
 * `MetadataSchema` and with every existing K8s-envelope artifact in this
 * repo (cost-schema, decision-schema) — only c4-schema's flat, non-enveloped
 * element schemas reject unknown top-level keys.
 */
export function defineArtifact<Kind extends string, SpecSchema extends z.ZodType>(
  kind: Kind,
  specSchema: SpecSchema,
) {
  return z
    .object({
      apiVersion: z.literal(API_VERSION).describe('Artifact API version discriminant.'),
      kind: z.literal(kind).describe('Artifact kind discriminant.'),
      metadata: MetadataSchema.describe('Common artifact identity.'),
      spec: specSchema,
    })
    .describe(`A WorkSpec ${kind} artifact.`);
}
