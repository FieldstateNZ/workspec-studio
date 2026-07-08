import type { Diagram, Layout } from '@workspec/c4-schema';

/** A resolved diagram node: a thin ref resolved against the tree, a fat inline node, or an injected system node. */
export interface ResolvedDiagramNode {
  /** Stable id used to match edge `from`/`to` and `.layout/` node keys — the element slug, the fat `id`, or `__system__`. */
  readonly nodeId: string;
  /** The element slug this node resolved to, or `null` for a dangling/unresolved reference. */
  readonly slug: string | null;
  /** The resolved element kind (or the fat node's free-string `type`), or `null` when unresolved. */
  readonly kind: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly technology: string | null;
  readonly tags: readonly string[];
  /** Inline pinned position from the thin node's own `position`, if any (independent of `.layout/`). */
  readonly position: { readonly x: number; readonly y: number } | null;
  /** True when this node was synthesised by the c4-context system-injection safety net, not authored in the YAML. */
  readonly injected: boolean;
  /** True when this reference could not be resolved to an element (a `dangling-ref` diagnostic was raised for it). */
  readonly dangling: boolean;
}

/** A resolved diagram edge, endpoints rewritten to the same `nodeId`s used by {@link ResolvedDiagramNode}. */
export interface ResolvedDiagramEdge {
  readonly from: string;
  readonly to: string;
  readonly label: string | null;
  readonly category: string | null;
  readonly lens: 'logical' | 'deployment' | 'both' | null;
  /** True when `from`/`to` didn't resolve to a node present in the diagram (a `dangling-edge-ref` diagnostic was raised). */
  readonly dangling: boolean;
}

/** One resolved node/edge view of a diagram — the only view for non-`c4-container` diagrams, one of two lenses for `c4-container`. */
export interface ResolvedDiagramView {
  readonly nodes: readonly ResolvedDiagramNode[];
  readonly edges: readonly ResolvedDiagramEdge[];
}

/** A loaded `.layout/` file attached to its diagram. */
export interface LoadedLayoutInfo {
  readonly path: string;
  readonly data: Layout;
}

/**
 * One fully resolved diagram. Exactly one of `view`/`lensViews` is
 * non-null: `c4-container` diagrams are lens-partitioned and expose both
 * resolutions side by side (see the S3 design brief); every other diagram
 * type resolves to a single `view`.
 */
export interface ResolvedDiagram {
  readonly slug: string;
  readonly path: string;
  readonly title: string;
  readonly type: string;
  readonly description: string | null;
  /** The as-parsed thin-or-fat diagram, unchanged — for callers that want the raw authored shape. */
  readonly raw: Diagram;
  readonly view: ResolvedDiagramView | null;
  readonly lensViews: { readonly logical: ResolvedDiagramView; readonly deployment: ResolvedDiagramView } | null;
  readonly layout: LoadedLayoutInfo | null;
}
