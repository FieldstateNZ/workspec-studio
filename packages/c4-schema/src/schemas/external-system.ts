import { z } from 'zod';
import { linksField } from './common/links-field.js';
import { sourceField } from './common/source-field.js';

/**
 * An external-system element: a system outside the boundary that this
 * project's system interacts with (e.g. a third-party payment gateway).
 * Lives at `.workspec/external-systems/<slug>.yaml`. Externality is
 * expressed by this kind (plus the `variant: external` style), not by an
 * `external: boolean` field — Enterprise has no such field anywhere.
 */
export const ExternalSystemElement = z
  .object({
    type: z
      .literal('external-system')
      .optional()
      .describe('Redundant kind literal; inferred from directory when absent.'),
    title: z.string().describe('Human-readable name of the external system.'),
    description: z.string().min(1).describe('What this external system provides and how it is used.'),
    tags: z.array(z.string()).optional().describe('Free-text labels for filtering and grouping.'),
    links: linksField,
    source: sourceField,
  })
  .strict()
  .describe('An external-system element: a system outside the project boundary.');

/** Inferred type of an external-system element. */
export type ExternalSystemElement = z.infer<typeof ExternalSystemElement>;
