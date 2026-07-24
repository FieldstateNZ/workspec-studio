import { z } from 'zod';
import { LayoutRect } from './layout-rect.js';

/**
 * A pinned resource's position within a `.layout/` file. The one
 * topology-specific extension over `@workspec/c4-schema`'s `LayoutNode`:
 * a topology renders through two lenses (network, resource-group), so each
 * pinned node carries a position PER LENS rather than a single position.
 * A lens key absent from `positions` means that lens auto-layouts this
 * resource; presence of the resource's own key in the parent `nodes` map at
 * all still requires at least the entry to exist, but either lens key may be
 * omitted independently (e.g. a resource shown only in the network lens has
 * no `positions.rg`).
 */
export const TopologyLayoutNode = z
  .object({
    positions: z
      .object({
        network: LayoutRect.optional().describe('Pinned position in the network-lens view.'),
        rg: LayoutRect.optional().describe('Pinned position in the resource-group-lens view.'),
      })
      .strict()
      .describe('Per-lens pinned positions; either lens key may be omitted independently.'),
  })
  .strict()
  .describe('A pinned resource position, per lens.');

/** Inferred type of a pinned topology layout node. */
export type TopologyLayoutNode = z.infer<typeof TopologyLayoutNode>;
