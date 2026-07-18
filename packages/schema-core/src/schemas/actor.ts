import { z } from 'zod';
import { linksField } from './common/links-field.js';
import { defineArtifact } from './define-artifact.js';

/**
 * The `Actor` spec: a human role or persona that interacts with the system
 * (e.g. "dev lead", "on-call engineer"). Lives at `.workspec/actors/<slug>.yaml`.
 *
 * Reconciles `@workspec/c4-schema`'s `ActorElement` (which calls this field
 * `title`) with the traceability spec's Actor (`docs/traceability/spec.md`
 * §4.1), which calls it `name` — `name` wins here since this is the shared,
 * canonical Actor both c4 and traceability consume going forward. Unlike
 * c4-schema's `ActorElement`, `description` is optional here (c4's own
 * "empty title allowed, but description is required" split was an
 * Enterprise-parity quirk specific to that package, not a rule worth
 * carrying into the shared kind).
 */
export const ActorSpec = z
  .object({
    name: z.string().min(1).describe('Human-readable name of the actor.'),
    description: z
      .string()
      .min(1)
      .optional()
      .describe('What this actor does and why it interacts with the system.'),
    tags: z.array(z.string()).optional().describe('Free-text labels for filtering and grouping.'),
    links: linksField,
  })
  .describe('An actor: a human role or persona that interacts with the system.');

/** A complete `Actor` artifact: the K8s-style envelope wrapping `ActorSpec`. */
export const ActorArtifact = defineArtifact('Actor', ActorSpec);

/** Inferred type of the `Actor` spec body. */
export type ActorSpec = z.infer<typeof ActorSpec>;

/** Inferred type of a complete `Actor` artifact. */
export type Actor = z.infer<typeof ActorArtifact>;
