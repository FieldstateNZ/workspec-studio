import { z } from 'zod';

/**
 * A fat diagram node: inline element data rather than a slug reference.
 * This is the legacy shape still emitted by the MCP `create_diagram` tool
 * — loaders must accept it alongside the thin shape.
 */
export const FatDiagramNode = z
  .object({
    id: z.string().describe('Stable node id, unique within the diagram.'),
    type: z.string().describe('Element kind this node represents, e.g. "container", "domain".'),
    label: z.string().describe('Human-readable label shown on the node.'),
    description: z
      .string()
      .optional()
      .describe('Optional prose description shown on hover/detail.'),
    tags: z.array(z.string()).optional().describe('Free-text labels for filtering and grouping.'),
    logical_type: z
      .string()
      .optional()
      .describe('Node kind under the logical lens (c4-container diagrams).'),
    deployment_target: z
      .string()
      .optional()
      .describe('Node kind under the deployment lens (c4-container diagrams).'),
  })
  .strict()
  .describe('A fat/legacy diagram node carrying inline element data.');

/** Inferred type of a fat diagram node. */
export type FatDiagramNode = z.infer<typeof FatDiagramNode>;
