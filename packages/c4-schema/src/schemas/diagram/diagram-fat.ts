import { z } from 'zod';
import { sourceField } from '../common/source-field.js';
import { DiagramEdge } from './diagram-edge.js';
import { DiagramTagStyle } from './diagram-tag-style.js';
import { FatDiagramNode } from './diagram-node-fat.js';

/**
 * The fat/legacy diagram YAML shape: nodes carry inline element data, and
 * the diagram itself carries a `tags` map of inline visual overrides.
 * Still emitted by the MCP `create_diagram` tool — the thin shape is
 * canonical for hand-authored diagrams going forward, but loaders must
 * accept both.
 */
export const FatDiagram = z
  .object({
    title: z.string().describe('Human-readable diagram title.'),
    type: z.string().describe('Diagram type, e.g. "c4-context", "c4-container", "c4-component".'),
    description: z
      .string()
      .optional()
      .describe('Optional prose description of what the diagram shows.'),
    nodes: z
      .array(FatDiagramNode)
      .describe('Inline element data for every node shown on this diagram.'),
    edges: z.array(DiagramEdge).describe("Connections between the diagram's nodes."),
    tags: z
      .record(z.string(), DiagramTagStyle)
      .optional()
      .describe('Diagram-level inline visual overrides, keyed by tag name.'),
    source: sourceField,
  })
  .strict()
  .describe('A fat/legacy diagram: nodes carry inline element data.');

/** Inferred type of a fat diagram. */
export type FatDiagram = z.infer<typeof FatDiagram>;
