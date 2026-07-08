import { z } from 'zod';

/**
 * Which lens(es) of a `c4-container` diagram an edge appears in. Container
 * diagrams are lens-partitioned: the same YAML resolves to `domain` nodes
 * under the logical lens and `container` nodes under the deployment lens.
 * An edge without a `lens` is shown under both.
 */
export const DIAGRAM_EDGE_LENSES = ['logical', 'deployment', 'both'] as const;

/**
 * A diagram edge, connecting two nodes by slug (or the `__system__`
 * alias). Shared between thin and fat diagrams — the node representation
 * differs between the two formats, but an edge is always this shape.
 */
export const DiagramEdge = z
  .object({
    from: z.string().describe('Slug (or `__system__`) of the source node.'),
    to: z.string().describe('Slug (or `__system__`) of the target node.'),
    label: z.string().optional().describe('Human-readable label shown on the edge.'),
    lens: z
      .enum(DIAGRAM_EDGE_LENSES)
      .optional()
      .describe(
        'Restricts which c4-container lens this edge appears under. Omit to show under both.',
      ),
    category: z
      .string()
      .optional()
      .describe('Free string keying a `connections` entry in the project style spec (spec.yaml).'),
  })
  .strict()
  .describe('An edge connecting two diagram nodes by slug.');

/** Inferred type of a diagram edge. */
export type DiagramEdge = z.infer<typeof DiagramEdge>;
