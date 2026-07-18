import { z } from 'zod';
import { Slug, linksField, defineArtifact } from '@workspec/schema-core';

/**
 * The `UserRequirement` spec (traceability spec §4.3): the requirement in
 * user-story form — the artifact the RTM actually traces. "As X I want Y so
 * that Z" is the promise that must be verified. Lives at
 * `.workspec/requirements/user/<slug>.yaml`.
 *
 * `actor` and `features[]` are bare-slug intra-tree refs (the field implies
 * the kind): `actor` → `actors/*`, `features[]` → `features/*`. Dangling
 * intra-tree refs are a `verify`-time failure (typo protection), not a schema
 * error — the schema only enforces slug *shape*, not resolution.
 */
export const UserRequirementSpec = z
  .object({
    title: z.string().min(1).describe('One-line summary of the requirement.'),
    actor: Slug.describe(
      'Bare-slug intra-tree ref → actors/*: the role this requirement is written for.',
    ),
    as: z.string().min(1).describe('User-story role clause, e.g. "a dev lead".'),
    want: z
      .string()
      .min(1)
      .describe('User-story desire clause, e.g. "to author a new element inline on the canvas".'),
    so: z
      .string()
      .min(1)
      .describe(
        'User-story rationale clause, e.g. "that I don\'t break flow switching to a form".',
      ),
    features: z
      .array(Slug)
      .min(1)
      .describe(
        'Bare-slug intra-tree refs → features/*: the feature(s) this requirement belongs to (at least one).',
      ),
    status: z
      .enum(['draft', 'agreed', 'implemented', 'verified'])
      .describe('Lifecycle status of the requirement.'),
    // Cross-references to other artifacts/docs via the shared `linksField`
    // primitive (issue #69: reuse/extend the shared links primitive). Each
    // entry is `{<linkType>: <pathRef>}` where the pathRef starts with `~/` or
    // `@workspace/` (e.g. `{ need: '@workspace/needs/frictionless-authoring' }`).
    //
    // NOTE: the spec §4.7 `<kind>:<slug>` kind-qualified cross-layer ref
    // convention (e.g. `need:frictionless-authoring`) is NOT frozen here. Spec
    // §9.2 flags that `need` illustration as unconfirmed/illustrative and
    // dependent on the (unread) Enterprise parent-chain above user-requirements.
    // Until that parent kind is confirmed, cross-layer refs ride the shared
    // pathRef `linksField`; the kind-qualified shorthand is deferred.
    links: linksField,
  })
  .describe('A user-requirement: a promise to an actor in user-story form (the RTM traces this).');

/** A complete `UserRequirement` artifact: the K8s-style envelope wrapping `UserRequirementSpec`. */
export const UserRequirementArtifact = defineArtifact('UserRequirement', UserRequirementSpec);

/** Inferred type of the `UserRequirement` spec body. */
export type UserRequirementSpec = z.infer<typeof UserRequirementSpec>;

/** Inferred type of a complete `UserRequirement` artifact. */
export type UserRequirement = z.infer<typeof UserRequirementArtifact>;
