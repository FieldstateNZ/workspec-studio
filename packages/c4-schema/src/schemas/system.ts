import { z } from 'zod';
import { linksField } from './common/links-field.js';
import { sourceField } from './common/source-field.js';

/**
 * The lifecycle phase of a WorkSpec project, as recorded on its singleton
 * system element.
 */
export const SYSTEM_PHASES = ['discovery', 'delivery', 'archived'] as const;

/**
 * The singleton system element: the C4 "System" box for the project itself.
 * Lives at `.workspec/system/<slug>.yaml` — one file expected per tree, but
 * the path scheme does not enforce that; it's a convention.
 */
export const SystemElement = z
  .object({
    type: z
      .literal('system')
      .optional()
      .describe('Redundant kind literal; inferred from directory when absent.'),
    title: z.string().describe('Human-readable project/system name.'),
    summary: z
      .string()
      .nullish()
      .describe(
        'Short one-line summary, distinct from the fuller `description`. May be explicitly null.',
      ),
    description: z
      .string()
      .min(1)
      .describe('Fuller prose description of what the system is and does.'),
    phase: z.enum(SYSTEM_PHASES).optional().describe('Current lifecycle phase of the project.'),
    current_phase: z
      .string()
      .optional()
      .describe('Freeform current-phase label, distinct from `phase`.'),
    slice_prefix: z
      .string()
      .optional()
      .describe('Prefix used when naming delivery slices for this project.'),
    status: z.string().optional().describe('Freeform status note.'),
    links: linksField,
    source: sourceField,
  })
  .strict()
  .describe('The singleton system element: the C4 "System" box for the project itself.');

/** Inferred type of the system element. */
export type SystemElement = z.infer<typeof SystemElement>;
