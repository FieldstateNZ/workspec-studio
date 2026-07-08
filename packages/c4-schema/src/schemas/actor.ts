import { z } from 'zod';
import { linksField } from './common/links-field.js';
import { sourceField } from './common/source-field.js';

/**
 * An actor element: a human role or persona that interacts with the
 * system (e.g. "architect", "on-call engineer"). Lives at
 * `.workspec/actors/<slug>.yaml`. `type` is an optional literal — the kind
 * is normally inferred from the directory on ingest, per Enterprise tree
 * conventions.
 */
export const ActorElement = z
  .object({
    type: z.literal('actor').optional().describe('Redundant kind literal; inferred from directory when absent.'),
    title: z.string().describe('Human-readable name of the actor.'),
    description: z.string().min(1).describe('What this actor does and why it interacts with the system.'),
    tags: z.array(z.string()).optional().describe('Free-text labels for filtering and grouping.'),
    links: linksField,
    source: sourceField,
  })
  .strict()
  .describe('An actor element: a human role or persona that interacts with the system.');

/** Inferred type of an actor element. */
export type ActorElement = z.infer<typeof ActorElement>;
