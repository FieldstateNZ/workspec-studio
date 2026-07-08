import { z } from 'zod';
import { FatDiagram } from './diagram-fat.js';
import { ThinDiagram } from './diagram-thin.js';

/**
 * A diagram YAML artifact: the thin (canonical) shape or the fat/legacy
 * shape emitted by the MCP `create_diagram` tool. Lives at
 * `.workspec/diagrams/<slug>.yaml`.
 */
export const Diagram = z
  .union([ThinDiagram, FatDiagram])
  .describe('A thin or fat diagram artifact.');

/** Inferred type of a diagram artifact. */
export type Diagram = z.infer<typeof Diagram>;
