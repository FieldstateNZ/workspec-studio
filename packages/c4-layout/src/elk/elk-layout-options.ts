import type { LayoutDirection } from '../model/layout-direction.js';

/**
 * Every ELK layout option this package relies on, spelled out explicitly —
 * determinism requires never leaning on an elkjs version's current default,
 * since a future elkjs upgrade could change a default and silently
 * reshuffle every previously-committed layout. Values are plain spacing
 * numbers (not derived from label width or content, unlike Enterprise's
 * dagre engine — see the conformance survey) because this package has no
 * rendering context to measure against; a caller wanting label-aware
 * spacing can post-process the result.
 *
 * `elk.layered.crossingMinimization.strategy` and
 * `...nodePlacement.strategy` are pinned to ELK's own documented
 * deterministic choices (greedy layer-sweep, network-simplex) rather than a
 * strategy that consults a random seed.
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
    // may override JUST this gap via `LayoutDiagramOptions.layerSpacing` —
    // the additive label-aware-spacing seam (S4 fix round, #120).
    'elk.layered.spacing.nodeNodeBetweenLayers': String(layerSpacing ?? 80),
    'elk.layered.spacing.edgeNodeBetweenLayers': '20',
    'elk.layered.spacing.edgeEdgeBetweenLayers': '10',
  };
}
