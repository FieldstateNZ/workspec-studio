import { z } from 'zod';
import { linksField } from './common/links-field.js';
import { sourceField } from './common/source-field.js';

/**
 * A domain element: C4 "container (logical)" in WorkSpec vocabulary — a
 * logical grouping of functionality within the system, seen through the
 * logical lens of a `c4-container` diagram. Lives at
 * `.workspec/domains/<slug>.yaml`. Carries no `type` literal — unlike
 * actor/system/external-system, the kind is never redundantly recorded in
 * the file for this kind.
 */
export const DomainElement = z
  .object({
    title: z.string().describe('Human-readable name of the domain.'),
    description: z.string().min(1).describe('What functionality this domain groups and why.'),
    tags: z.array(z.string()).optional().describe('Free-text labels for filtering and grouping.'),
    links: linksField,
    source: sourceField,
  })
  .strict()
  .describe('A domain element: a logical grouping of functionality (C4 "container (logical)").');

/** Inferred type of a domain element. */
export type DomainElement = z.infer<typeof DomainElement>;
