// Pure mapping from a `reconcile()` result to the Drift view's CANVAS
// props (`TopologyCanvas`'s `driftBySlug`/`orphanNodes`/`ghostEdges`
// extension points) — kept out of `drift-side-panel.tsx` so the canvas data
// shape and the panel's list-item shape (`drift-panel-data.ts`) each stay
// independently testable pure functions.

import type { DerivedTopology, Drift } from '@workspec/topology-recon';
import type { DriftClass } from '@workspec/topology-recon';
import type { GhostEdge } from './edge-layer.js';
import type { OrphanCanvasNode } from './topology-canvas.js';

/**
 * Per-authored-slug drift class for `TopologyCanvas`'s `driftBySlug`.
 * `phantom` and `divergent` each name exactly one authored slug; `miswired`
 * is deliberately NOT badged on individual node cards (its `slugs` cluster
 * can span several unrelated-looking resources — the ghost reroute edge
 * (`buildGhostEdges`) is the class's own, clearer canvas signal), matching
 * the authoritative design's own worked example, which never sets a node's
 * `drift` to `'miswired'` either.
 */
export function buildDriftBySlug(drifts: readonly Drift[]): Record<string, DriftClass> {
  const bySlug: Record<string, DriftClass> = {};
  for (const drift of drifts) {
    if (drift.class === 'phantom') bySlug[drift.slug] = 'phantom';
    else if (drift.class === 'divergent') bySlug[drift.authoredSlug] = 'divergent';
  }
  return bySlug;
}

/** Every `orphan`-class drift's actual-side resource, shaped for `TopologyCanvas`'s `orphanNodes`. */
export function buildOrphanNodes(
  derived: DerivedTopology,
  drifts: readonly Drift[],
): readonly OrphanCanvasNode[] {
  const orphanSlugs = new Set(drifts.filter((d) => d.class === 'orphan').map((d) => d.slug));
  return derived.resources
    .filter((resource) => orphanSlugs.has(resource.slug))
    .map((resource) => ({
      slug: resource.slug,
      kind: resource.kind,
      name: resource.name,
      type: resource.type,
    }));
}

/**
 * Every `miswired` drift's ACTUAL-only edges, shaped for `TopologyCanvas`'s
 * `ghostEdges` — the "actual connects differently" bypass line. The
 * authored-only edges (what SHOULD be wired but isn't observed) have no
 * equivalent line of their own: the declared edge is already drawn by the
 * normal `EdgeLayer` connections pass, so only the surprise (observed but
 * undeclared) routing needs a distinct ghost treatment.
 */
export function buildGhostEdges(drifts: readonly Drift[]): readonly GhostEdge[] {
  return drifts
    .filter((d): d is Extract<Drift, { class: 'miswired' }> => d.class === 'miswired')
    .flatMap((d) => d.edges.filter((edge) => edge.side === 'actual-only'))
    .map((edge) => ({ from: edge.from, to: edge.to }));
}
