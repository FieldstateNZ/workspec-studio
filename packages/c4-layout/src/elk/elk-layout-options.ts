import type { LayoutDirection } from '../model/layout-direction.js';

/**
 * The ELK layout options this package sets explicitly. The goal is to lean
 * on as few elkjs defaults as possible: a future elkjs upgrade that changes
 * a default would silently reshuffle every previously-committed layout.
 *
 * `elk.layered.crossingMinimization.strategy` and
 * `...nodePlacement.strategy` are pinned to ELK's own documented
 * deterministic choices (greedy layer-sweep, network-simplex) rather than a
 * strategy that consults a random seed.
 *
 * NOT EXHAUSTIVE, despite what this comment used to claim. The known gap is
 * `elk.layered.layering.strategy` — the layer-assignment pass that decides
 * which column each node lands in. It is left at the elkjs default, so an
 * upgrade that changes that default WOULD move committed layouts and the
 * golden snapshots would be the thing that catches it. Pin it (and audit
 * for further gaps) before treating "deterministic across elkjs versions"
 * as a guarantee rather than an aspiration; today it holds only because the
 * elkjs version is locked.
 *
 * Values are plain spacing numbers, not derived from label width or content
 * (unlike Enterprise's dagre engine — see the conformance survey), because
 * this package has no rendering context to measure against.
 */
export function elkLayoutOptionsFor(
  direction: LayoutDirection,
  layerSpacing?: number,
): Record<string, string> {
  return {
    'elk.algorithm': 'layered',
    'elk.direction': direction === 'LR' ? 'RIGHT' : 'DOWN',
    'elk.edgeRouting': 'ORTHOGONAL',
    'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
    'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
    'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    'elk.spacing.nodeNode': '40',
    'elk.spacing.edgeNode': '20',
    'elk.spacing.edgeEdge': '10',
    // The DEFAULT stays the pinned 80 (frozen-model warning above). A caller
    // may override JUST this gap via `LayoutDiagramOptions.layerSpacing`
    // (S4 fix round, #120). No shipped caller does — c4-ui's label-aware
    // override was reverted in #134; see that option's TSDoc.
    'elk.layered.spacing.nodeNodeBetweenLayers': String(layerSpacing ?? 80),
    'elk.layered.spacing.edgeNodeBetweenLayers': '20',
    'elk.layered.spacing.edgeEdgeBetweenLayers': '10',
  };
}
