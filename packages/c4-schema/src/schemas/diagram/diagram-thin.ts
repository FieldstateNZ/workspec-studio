import { z } from 'zod';
import { sourceField } from '../common/source-field.js';
import { DiagramEdge } from './diagram-edge.js';
import { ThinDiagramNode } from './diagram-node-thin.js';

/**
 * The thin diagram YAML shape (canonical v4): nodes are slug references
 * (bare or typed), never inline element data. `type` is a free string in
 * the schema — known values are `c4-context`, `c4-container`,
 * `c4-component`, `c4-code`, `sequence`, `er`, `flow`, `deployment`,
 * `custom`, but nothing else constrains it here.
 */
export const ThinDiagram = z
  .object({
    title: z.string().describe('Human-readable diagram title.'),
    type: z.string().describe('Diagram type, e.g. "c4-context", "c4-container", "c4-component".'),
    description: z.string().optional().describe('Optional prose description of what the diagram shows.'),
    nodes: z.array(ThinDiagramNode).describe('Slug references to the elements shown on this diagram.'),
    edges: z.array(DiagramEdge).describe('Connections between the diagram\'s nodes.'),
    source: sourceField,
  })
  .strict()
  .describe('A thin diagram: nodes are slug references, not inline element data.');

/** Inferred type of a thin diagram. */
export type ThinDiagram = z.infer<typeof ThinDiagram>;
