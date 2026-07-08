import { z } from 'zod';

/**
 * Inline visual override for one diagram-level tag, as used by the fat/
 * legacy diagram format's top-level `tags` map (`Record<tagName,
 * DiagramTagStyle>`).
 */
export const DiagramTagStyle = z
  .object({
    color: z
      .string()
      .optional()
      .describe('Accent color for nodes carrying this tag, e.g. a hex or hsl value.'),
    border: z.string().optional().describe('Border style override for nodes carrying this tag.'),
  })
  .strict()
  .describe('Inline visual override for a diagram-level tag.');

/** Inferred type of a diagram tag style override. */
export type DiagramTagStyle = z.infer<typeof DiagramTagStyle>;
