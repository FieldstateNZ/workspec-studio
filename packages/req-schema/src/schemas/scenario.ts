import { z } from 'zod';
import { Slug, defineArtifact } from '@workspec/schema-core';

/**
 * The `Scenario` spec (traceability spec §4.5): the executed unit — one
 * Gherkin scenario per file. The scenario name is the slug is the identity.
 * Lives at `.workspec/scenarios/<slug>.yaml`, its own (fifth) file-native
 * kind, distinct from the `SystemRequirement` Rule (§4.4) it belongs to.
 *
 * `systemRequirement` is a bare-slug intra-tree ref (the field implies the
 * kind) → `requirements/system/*`: its parent Rule. Dangling intra-tree refs
 * are a `verify`-time failure (typo protection), not a schema error — the
 * schema only enforces slug *shape*, not resolution.
 *
 * `given`/`when`/`then` are plain string arrays. Continuation steps ("and
 * types a name…") are just additional array items — no special handling.
 * `then` is required and non-empty: a scenario with no assertion is
 * meaningless. `examples` (optional) turns the scenario into a Scenario
 * Outline; `given`/`when`/`then` may then contain `<placeholder>` tokens. T1
 * does NOT cross-validate placeholders against the examples table.
 */
export const ScenarioSpec = z
  .object({
    title: z.string().min(1).describe('One-line summary of what the scenario asserts.'),
    systemRequirement: Slug.describe(
      'Bare-slug intra-tree ref → requirements/system/*: the parent Rule this scenario belongs to.',
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
    'A scenario: ONE Gherkin scenario, the executed unit. The file is the scenario, the slug is the scenario name is the identity. References its parent Rule via systemRequirement.',
  );

/** A complete `Scenario` artifact: the K8s-style envelope wrapping `ScenarioSpec`. */
export const ScenarioArtifact = defineArtifact('Scenario', ScenarioSpec);

/** Inferred type of the `Scenario` spec body. */
export type ScenarioSpec = z.infer<typeof ScenarioSpec>;

/** Inferred type of a complete `Scenario` artifact. */
export type Scenario = z.infer<typeof ScenarioArtifact>;
