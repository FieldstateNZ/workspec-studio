import { z } from 'zod';
import { LayoutEdge } from './layout-edge.js';
import { TopologyLayoutNode } from './layout-node.js';
import { LayoutViewport } from './layout-viewport.js';

/**
 * A `.layout/` file: `.workspec/topologies/.layout/<topology-slug>.yaml`,
 * keyed to the topology it positions. Mirrors `@workspec/c4-schema`'s
 * `Layout` exactly (bare schema, no `defineArtifact` envelope — a layout
 * file is a special, unregistered file, not a fourth artifact kind), with
 * one extension: `nodes` entries carry a position per lens
 * (`TopologyLayoutNode`) instead of a single position.
 *
 * Optionality is the contract: no file for a topology means fully
 * auto-laid-out; a present `nodes` entry pins that resource's position (per
 * lens) and the rest still auto-layout around it; an absent
 * `edges`/`viewport` means no routing hint / no persisted camera state.
 */
export const Layout = z
  .object({
    version: z.literal(1).describe('Layout file format version; always 1.'),
    nodes: z
      .record(z.string().min(1), TopologyLayoutNode)
      .describe(
        'Pinned resource positions, keyed by resource slug. Absence of a key means auto-layout.',
      ),
    edges: z
      .record(z.string().min(1), LayoutEdge)
      .optional()
      .describe('Optional per-connection routing hints, keyed by "<from>-><to>".'),
    viewport: LayoutViewport.optional().describe('Optional persisted camera state.'),
  })
  .strict()
  .describe(
    'A topology layout file, pinning per-lens resource positions and optionally connection ' +
      'routing and camera state.',
  );

/** Inferred type of a layout file. */
export type Layout = z.infer<typeof Layout>;
