import { z } from 'zod';
import { Slug, linksField, defineArtifact } from '@workspec/schema-core';

/**
 * The `SystemRequirement` spec (traceability spec §4.4): **a Gherkin Rule.**
 * A named, verifiable statement that belongs to a `feature`, verifies one or
 * more `userReqs`, and **groups scenarios** — but carries NO `given`/`when`/
 * `then` steps of its own. Those live on the `Scenario` kind (§4.5), which
 * references its parent Rule via `systemRequirement`. Lives at
 * `.workspec/requirements/system/<slug>.yaml`.
 *
 * A Rule with no scenarios is an "empty rule" (§4.7) — a requirement with no
 * proof at all — which is a derived finding at the model layer, not something
 * this schema rejects: a Rule is a complete artifact on its own, scenarios
 * arrive (or don't) independently.
 *
 * `feature` and `userReqs[]` are bare-slug intra-tree refs (the field implies
 * the kind): `feature` → `features/*` (the containing feature), `userReqs[]`
 * → `requirements/user/*` (the "verifies" edge that makes the tree an RTM).
 * Dangling intra-tree refs are a `verify`-time failure (typo protection), not
 * a schema error — the schema only enforces slug *shape*, not resolution.
 */
export const SystemRequirementSpec = z
  .object({
    title: z.string().min(1).describe('One-line summary of the requirement this Rule states.'),
    feature: Slug.describe('Bare-slug intra-tree ref → features/*: the containing feature.'),
    userReqs: z
      .array(Slug)
      .min(1)
      .describe(
        'Bare-slug intra-tree refs → requirements/user/*: the user-requirement(s) this Rule verifies (the "verifies" edge; at least one).',
      ),
    links: linksField,
  })
  .describe(
    'A system-requirement: a Gherkin Rule. Groups the scenarios that prove it; has no steps of its own.',
  );

/** A complete `SystemRequirement` artifact: the K8s-style envelope wrapping `SystemRequirementSpec`. */
export const SystemRequirementArtifact = defineArtifact('SystemRequirement', SystemRequirementSpec);

/** Inferred type of the `SystemRequirement` spec body. */
export type SystemRequirementSpec = z.infer<typeof SystemRequirementSpec>;

/** Inferred type of a complete `SystemRequirement` artifact. */
export type SystemRequirement = z.infer<typeof SystemRequirementArtifact>;
