import type { ResourceKindType } from '@workspec/topology-schema';

/**
 * The three `ResourceKind`s that render as a container box in their OWN
 * lens (spec §3.2's normative rule): `vnet`/`subnet` in the network lens,
 * `resource-group` in the resource-group lens. `kind` alone decides this —
 * there is no separate "is this a container" flag on `Resource` itself (see
 * `@workspec/topology-schema`'s `ResourceSpec.kind` doc comment).
 */
export const GROUPING_KINDS = ['vnet', 'subnet', 'resource-group'] as const;

/** One of the three grouping kinds. */
export type GroupingKind = (typeof GROUPING_KINDS)[number];

/** True if `kind` is one of the three grouping kinds, in ANY lens. Use {@link isGroupingKindForLens} to test against one specific lens's own grouping kind(s). */
export function isGroupingKind(kind: ResourceKindType): kind is GroupingKind {
  return (GROUPING_KINDS as readonly string[]).includes(kind);
}

/**
 * True if `kind` is the grouping kind for `lens` specifically — `vnet`/
 * `subnet` for `'network'`, `resource-group` for `'rg'`. This is the
 * predicate lens-tree building actually uses: a `resource-group` resource
 * is a grouping kind in general, but not in the network lens (there it's an
 * ordinary node), and vice versa for `vnet`/`subnet` in the resource-group
 * lens.
 */
export function isGroupingKindForLens(kind: ResourceKindType, lens: 'network' | 'rg'): boolean {
  return lens === 'network' ? kind === 'vnet' || kind === 'subnet' : kind === 'resource-group';
}
