import { z } from 'zod';
import { LayoutEdge } from './layout-edge.js';
import { LayoutNode } from './layout-node.js';
import { LayoutViewport } from './layout-viewport.js';

/**
 * A `.layout/` file: `.workspec/diagrams/.layout/<diagram-slug>.yaml`,
 * keyed to the diagram it positions. This is new surface graduating
 * Enterprise's `diagram_layouts` DB table into a plain-file format (see
 * the package README for the full design rationale).
 *
 * Optionality is the contract: no file for a diagram means fully
 * auto-laid-out; a present `nodes` entry pins that element's position and
 * the rest still auto-layout around it; an absent `edges`/`viewport` means
 * no routing hint / no persisted camera state.
 */
export const Layout = z
  .object({
    version: z.literal(1).describe('Layout file format version; always 1.'),
    nodes: z
      .record(z.string().min(1), LayoutNode)
      .describe(
        'Pinned node positions, keyed by element slug. Absence of a key means auto-layout.',
      ),
    edges: z
      .record(z.string().min(1), LayoutEdge)
      .optional()
      .describe('Optional per-edge routing hints, keyed by "<from>-><to>".'),
    viewport: LayoutViewport.optional().describe('Optional persisted camera state.'),
  })
  .strict()
  .describe(
    'A diagram layout file, pinning node positions and optionally edge routing and camera state.',
  );

/** Inferred type of a layout file. */
export type Layout = z.infer<typeof Layout>;
