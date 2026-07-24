// Pure mapping from a `reconcile()` result to the Drift view's SIDE PANEL
// list content — one display-ready group per `DriftClass`, in the recon
// package's own normative order (`DRIFT_CLASSES`). Kept separate from
// `drift-canvas-data.ts` (the canvas's own, differently-shaped mapping) so
// each stays an independently testable pure function; `drift-panel.tsx`
// itself stays purely presentational over this module's output.

import { DRIFT_CLASSES } from '@workspec/topology-recon';
import type { DerivedTopology, Drift, DriftClass } from '@workspec/topology-recon';
import type { ResolvedTopology } from '@workspec/topology-model';

/** One drift-panel list row: a resource/edge name, a short hint, and the slug clicking it selects (`null` when the row has no single node to select — never expected today, but kept honest rather than forcing a slug). */
export interface DriftListItem {
  readonly key: string;
  readonly label: string;
  readonly hint: string;
  readonly targetSlug: string | null;
}

/** One `DriftClass`'s panel group: its display-ready rows plus the count badge. */
export interface DriftClassGroup {
  readonly cls: DriftClass;
  readonly count: number;
  readonly items: readonly DriftListItem[];
}

function itemForPhantom(drift: Extract<Drift, { class: 'phantom' }>, resolved: ResolvedTopology): DriftListItem {
  const resource = resolved.resources.find((r) => r.slug === drift.slug);
  return {
    key: `phantom:${drift.slug}`,
    label: resource?.name ?? drift.slug,
    hint: resource?.type ?? drift.slug,
    targetSlug: drift.slug,
  };
}

function itemForOrphan(drift: Extract<Drift, { class: 'orphan' }>, derived: DerivedTopology): DriftListItem {
  const resource = derived.resources.find((r) => r.slug === drift.slug);
  return {
    key: `orphan:${drift.slug}`,
    label: resource?.name ?? drift.slug,
    hint: resource?.type ?? drift.slug,
    targetSlug: drift.slug,
  };
}

function itemForDivergent(
  drift: Extract<Drift, { class: 'divergent' }>,
  resolved: ResolvedTopology,
): DriftListItem {
  const resource = resolved.resources.find((r) => r.slug === drift.authoredSlug);
  return {
    key: `divergent:${drift.authoredSlug}`,
    label: resource?.name ?? drift.authoredSlug,
    hint: resource?.type ?? drift.authoredSlug,
    targetSlug: drift.authoredSlug,
  };
}

function itemForMiswired(drift: Extract<Drift, { class: 'miswired' }>): DriftListItem {
  const bypass = drift.edges.find((edge) => edge.side === 'actual-only') ?? drift.edges[0];
  return {
    key: `miswired:${drift.slugs.join(',')}`,
    label: bypass ? `${bypass.from} → ${bypass.to}` : drift.slugs.join(' · '),
    hint: `${drift.edges.length} edge${drift.edges.length === 1 ? '' : 's'} differ`,
    targetSlug: drift.slugs[0] ?? null,
  };
}

function itemFor(drift: Drift, resolved: ResolvedTopology, derived: DerivedTopology): DriftListItem {
  switch (drift.class) {
    case 'phantom':
      return itemForPhantom(drift, resolved);
    case 'orphan':
      return itemForOrphan(drift, derived);
    case 'divergent':
      return itemForDivergent(drift, resolved);
    case 'miswired':
      return itemForMiswired(drift);
  }
}

/** Groups a `Drift[]` into one display-ready {@link DriftClassGroup} per {@link DRIFT_CLASSES} entry, always in that fixed order (a class with zero drifts still gets an entry, with an empty `items`). */
export function buildDriftGroups(
  resolved: ResolvedTopology,
  derived: DerivedTopology,
  drifts: readonly Drift[],
): readonly DriftClassGroup[] {
  return DRIFT_CLASSES.map((cls) => {
    const classDrifts = drifts.filter((d) => d.class === cls);
    return {
      cls,
      count: classDrifts.length,
      items: classDrifts.map((d) => itemFor(d, resolved, derived)),
    };
  });
}

/** The `phantom`/`divergent`/`miswired` drift touching one AUTHORED slug, for `NodeDetail`'s drift box. `orphan` is deliberately excluded — an orphan slug never appears in `resolved.resources`, so it never reaches `NodeDetail` (see `orphan-detail.tsx` instead). */
export function driftForAuthoredSlug(drifts: readonly Drift[], slug: string): Drift | undefined {
  return drifts.find((drift) => {
    if (drift.class === 'phantom') return drift.slug === slug;
    if (drift.class === 'divergent') return drift.authoredSlug === slug;
    if (drift.class === 'miswired') return drift.slugs.includes(slug);
    return false;
  });
}

/** The `orphan` drift (if any) for one ACTUAL-only slug, for `orphan-detail.tsx`. */
export function orphanDriftForSlug(drifts: readonly Drift[], slug: string): Drift | undefined {
  return drifts.find((drift) => drift.class === 'orphan' && drift.slug === slug);
}
