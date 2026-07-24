// The host contract. Everything the UI needs from its embedder arrives
// through `TopologyStudioHost`: the tree's file source (the same port
// `@workspec/topology-model`'s loader takes — reads only; write-back is a
// later increment, see `TopologyStudioCapabilities`), a link resolver for a
// resource's `realizes` c4-container chips, and capability flags. Components
// never touch storage or theme directly — they read them from the provider
// (see `context.tsx`). This is what makes the same views run standalone (the
// studio host) and, later, inside WorkSpec Enterprise or as a
// module-federation remote with no forks. Mirrors
// `@workspec/decision-ui`'s `host.ts` shape.

import type { TopologyFileSource } from '@workspec/topology-model';
import type { DerivedTopology } from '@workspec/topology-recon';
import type { Catalog } from '@workspec/decision-schema';

/**
 * A navigation target the host understands, handed to
 * {@link TopologyStudioHost.links}'s resolved `onClick`. Today the only
 * link source is a resolved resource's `realizes` c4-container slugs (the
 * side panel's "realizes" chips) — `kind` is fixed at `'c4-container'` for
 * that case, but the shape stays general so a later increment (recon/cost
 * cross-links) can reuse it without a breaking change.
 */
export interface LinkTarget {
  /** The link kind, e.g. "c4-container". */
  kind: string;
  /** The human-readable label shown on the chip. */
  label: string;
  /** The opaque target the host resolves — here, the c4-container slug. */
  target: string;
}

/**
 * The outcome of resolving a {@link LinkTarget}. A host that cannot resolve
 * a link returns `{ resolved: false }` and the UI renders an **inert
 * label** (a plain chip, no anchor, no handler). A host that can resolve
 * returns `resolved: true` with an `href` (renders an anchor) and/or an
 * `onClick` (renders a button). Mirrors `@workspec/decision-ui`'s
 * `LinkResolution` contract shape exactly.
 */
export type LinkResolution =
  | { resolved: false }
  | {
      resolved: true;
      /** Render as an anchor to this URL when present. */
      href?: string;
      /** Render as a button invoking this when present (e.g. host navigation). */
      onClick?: () => void;
      /** Optional tooltip / accessible description. */
      title?: string;
    };

/**
 * Resolves a "realizes" chip's {@link LinkTarget} to something renderable.
 * The standalone default ({@link createInertLinkResolver}) resolves
 * nothing, so every chip renders inert. An embedding host (e.g. one that can
 * jump to the c4 Studio's container view) supplies its own resolver.
 */
export type LinkResolver = (link: LinkTarget) => LinkResolution;

/**
 * Feature capabilities the host grants. `editLayout` is the seam for a
 * later drag-to-pin increment (writing back through `source` to the
 * `.layout/` file) — this authored-only slice always renders read-only, so
 * every host passes `editLayout: false` today; the flag exists now so
 * turning it on later is not a breaking change to the prop shape.
 */
export interface TopologyStudioCapabilities {
  /** Whether drag-to-pin node positions is permitted. Always `false` in this authored-only slice. */
  editLayout: boolean;
}

/**
 * The single object the UI depends on. Provide it to
 * `TopologyStudioProvider`. No other channel exists — there is deliberately
 * no global, no direct `window`, no ambient theme.
 */
export interface TopologyStudioHost {
  /** The tree's file source — the same port `loadTopologyModel` reads through. */
  source: TopologyFileSource;
  /** Turns a resource's `realizes` c4-container refs into hrefs/handlers, or leaves them inert. */
  links: LinkResolver;
  /** What the current host permits. */
  capabilities: TopologyStudioCapabilities;
  /**
   * OPTIONAL (P5 recon): loads one environment's actual deployed-state
   * topology, for `useReconcile`'s `reconcile()` call against the authored
   * `ResolvedTopology`. Return `null` when nothing has been imported for
   * this environment yet (e.g. `workspec-topology import` was never run) —
   * the Drift view then renders a clean empty state instead of crashing.
   * Omit the method entirely when the host has no import pipeline wired up
   * at all; `useReconcile` treats a missing method the same as a `null`
   * result.
   */
  loadDerived?(envSlug: string): Promise<DerivedTopology | null>;
  /**
   * OPTIONAL (P6 cost): loads the decision-catalog `Catalog` the Cost view
   * prices the resolved topology against via `computeTopologyCost`. Return
   * `null` when no catalog is configured for this tree — the Cost view then
   * renders a clean empty state instead of crashing. Omit the method
   * entirely when the host has no catalog source at all; `useCost` treats a
   * missing method the same as a `null` result.
   */
  loadCatalog?(): Promise<Catalog | null>;
}

/**
 * The standalone default: every link is unresolved, so the side panel's
 * "realizes" chips render as inert labels. Hosts that can resolve links
 * supply their own.
 */
export function createInertLinkResolver(): LinkResolver {
  return () => ({ resolved: false });
}

// ── Query-key identity for a source instance ─────────────────────────────
// TanStack Query keys must be structurally comparable; a `TopologyFileSource`
// object is not. Assign each source instance a stable string id (via a
// WeakMap) so query keys can be keyed on "which source" without
// stringifying the object. Mirrors `@workspec/decision-ui`'s `repositoryId`.

const sourceIds = new WeakMap<TopologyFileSource, string>();
let sourceSeq = 0;

/** A stable string id for a `TopologyFileSource` instance, for use in query keys. */
export function sourceId(source: TopologyFileSource): string {
  let id = sourceIds.get(source);
  if (id === undefined) {
    id = `source:${(sourceSeq += 1)}`;
    sourceIds.set(source, id);
  }
  return id;
}
