import { z } from 'zod';
import { Slug, defineArtifact } from '@workspec/schema-core';

/**
 * The `SystemRequirement` spec (traceability spec §4.4): **the file IS the
 * scenario.** One Gherkin scenario per file — the scenario name is the slug is
 * the identity. There is NO nested `scenarios[]` array and NO scenario `id`
 * (this is the load-bearing correction folded in from spec review, §9.1).
 * Lives at `.workspec/requirements/system/<slug>.yaml`.
 *
 * `feature` and `userReqs[]` are bare-slug intra-tree refs (the field implies
 * the kind): `feature` → `features/*` (the containing feature), `userReqs[]` →
 * `requirements/user/*` (the "verifies" edge that makes the tree an RTM).
 *
 * `given`/`when`/`then` are plain string arrays. Continuation steps ("and
 * types a name…") are just additional array items — no special handling.
 * `then` is required and non-empty: a scenario with no assertion is
 * meaningless. `examples` (optional) turns the scenario into a Scenario
 * Outline; `given`/`when`/`then` may then contain `<placeholder>` tokens.
 * T1 does NOT cross-validate placeholders against the examples table.
 */
export const SystemRequirementSpec = z
  .object({
    title: z.string().min(1).describe('One-line summary of what the scenario asserts.'),
    feature: Slug.describe('Bare-slug intra-tree ref → features/*: the containing feature.'),
    userReqs: z
      .array(Slug)
      .min(1)
      .describe(
        'Bare-slug intra-tree refs → requirements/user/*: the user-requirement(s) this scenario verifies (the "verifies" edge; at least one).',
      ),
    given: z
      .array(z.string().min(1))
      .optional()
      .describe(
        'Gherkin "Given" steps (preconditions). Continuation steps are additional array items.',
      ),
    when: z
      .array(z.string().min(1))
      .optional()
      .describe(
        'Gherkin "When" steps (the action). Continuation steps are additional array items.',
      ),
    then: z
      .array(z.string().min(1))
      .min(1)
      .describe(
        'Gherkin "Then" steps (the assertions). At least one — a scenario without an assertion is meaningless.',
      ),
    examples: z
      .array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])))
      .optional()
      .describe(
        'Optional examples table → Scenario Outline. given/when/then may reference "<placeholder>" tokens keyed on these columns; no placeholder cross-validation in T1.',
      ),
  })
  .describe(
    'A system-requirement: ONE Gherkin scenario. The file is the scenario, the slug is the scenario name is the identity. No nested scenarios[], no scenario id.',
  );

/** A complete `SystemRequirement` artifact: the K8s-style envelope wrapping `SystemRequirementSpec`. */
export const SystemRequirementArtifact = defineArtifact('SystemRequirement', SystemRequirementSpec);

/** Inferred type of the `SystemRequirement` spec body. */
export type SystemRequirementSpec = z.infer<typeof SystemRequirementSpec>;

/** Inferred type of a complete `SystemRequirement` artifact. */
export type SystemRequirement = z.infer<typeof SystemRequirementArtifact>;
