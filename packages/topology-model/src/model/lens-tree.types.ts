import type { ResourceKindType } from '@workspec/topology-schema';

/** Which of the two normative lenses a tree was built for. */
export type LensId = 'network' | 'rg';

/** A pinned position, joined in from the `.layout/` file for the active lens — `null` when unpositioned (auto-layout). */
export interface LensPosition {
  readonly x: number;
  readonly y: number;
  readonly width: number | null;
  readonly height: number | null;
}

/** An ordinary (non-container) node in a lens tree — a resource that is not a grouping kind IN THIS LENS. */
export interface LensNode {
  readonly slug: string;
  readonly kind: ResourceKindType;
  readonly name: string;
  readonly position: LensPosition | null;
}

/**
 * A container box in a lens tree — a resource whose `kind` is the grouping
 * kind for THIS lens (`vnet`/`subnet` for the network lens, `resource-group`
 * for the resource-group lens), rendered as a box with nested children
 * rather than a plain node. `name` is the resolved display name (the
 * naming-suffixed name for a `resource-group` box; the resource's own `name`
 * otherwise).
 */
export interface LensContainer {
  readonly slug: string;
  readonly kind: ResourceKindType;
  readonly name: string;
  readonly position: LensPosition | null;
  readonly children: readonly LensEntry[];
}

/** One entry at any level of a lens tree: either a container box or a plain node. */
export type LensEntry =
  | { readonly type: 'container'; readonly container: LensContainer }
  | { readonly type: 'node'; readonly node: LensNode };

/**
 * Summary counts for a lens tree's UI header (e.g. "7 resources · 1 VNet ·
 * 1 subnet"). `resources` is every surviving resource represented anywhere
 * in the tree — both container boxes and plain nodes, since a container box
 * is itself a resource too. `containersByKind` is a breakdown of just the
 * container-box entries, keyed by `ResourceKind` (a subset of `resources`,
 * not additional to it) — the UI formats the human-readable string from
 * this, this package only supplies the counted data.
 */
export interface LensTreeCounts {
  readonly resources: number;
  readonly containersByKind: Readonly<Record<string, number>>;
}

/**
 * One fully built lens tree: `buildNetworkTree`'s and
 * `buildResourceGroupTree`'s shared return shape. `roots` is every entry
 * with no container of this lens's grouping kind as its parent — i.e. every
 * top-level vnet, and every resource with no `network` ref, for the network
 * lens; every top-level `resource-group`, and every resource with no
 * `resourceGroup` ref, for the resource-group lens.
 */
export interface LensTree {
  readonly lens: LensId;
  readonly roots: readonly LensEntry[];
  readonly counts: LensTreeCounts;
}
