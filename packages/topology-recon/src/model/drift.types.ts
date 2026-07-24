import type { ResourceCost } from '@workspec/topology-schema';

/**
 * The four drift classes `reconcile()` (spec §4) can report, in the order
 * the spec lists them — also the class-sort order `sortDrifts` uses, so this
 * array is the single source of truth for both.
 */
export const DRIFT_CLASSES = ['phantom', 'orphan', 'divergent', 'miswired'] as const;

/** One of the four drift classes. */
export type DriftClass = (typeof DRIFT_CLASSES)[number];

/** An authored resource declared in the topology with no counterpart in the actual deployed state. */
export interface PhantomDrift {
  readonly class: 'phantom';
  readonly slug: string;
  readonly message: string;
}

/** A deployed resource observed in the actual state that is declared nowhere in the authored topology. */
export interface OrphanDrift {
  readonly class: 'orphan';
  readonly slug: string;
  readonly message: string;
}

/** One resolved `config` key whose value differs (or is present on only one side) between authored and actual. */
export interface ConfigKeyDiff {
  readonly key: string;
  readonly authored: unknown;
  readonly actual: unknown;
}

/** One top-level resolved `cost` field that differs between authored and actual. `attribution` is never reported (see `diffCost`). */
export interface CostKeyDiff {
  readonly key: Exclude<keyof ResourceCost, 'attribution'>;
  readonly authored: unknown;
  readonly actual: unknown;
}

/** A matched authored/actual resource pair whose resolved config or cost differ. */
export interface DivergentDrift {
  readonly class: 'divergent';
  readonly authoredSlug: string;
  readonly actualSlug: string;
  readonly message: string;
  /** Differing `config` keys (deep comparison; a key present on only one side counts as differing). */
  readonly configDiff: readonly ConfigKeyDiff[];
  /** Differing `cost` fields (`sku`/`mode`/`schedule`/`qty`). */
  readonly costDiff: readonly CostKeyDiff[];
}

/** One connection present on only one side of a `miswired` pair — the other side is missing it entirely. */
export interface MiswiredEdge {
  readonly from: string;
  readonly to: string;
  readonly class: string;
  readonly side: 'authored-only' | 'actual-only';
}

/**
 * A connected cluster of matched resources whose declared and observed
 * connections disagree for at least one edge between them — an authored edge
 * missing from actual, an actual edge missing from authored, or (a rerouted
 * path) both at once. `slugs` lists every matched-resource slug (authored-
 * canonical) touched by at least one differing edge in this cluster;
 * `edges` is every differing edge itself. Edges are clustered by shared
 * endpoints (see `diffConnections`) rather than reported one-by-one, so a
 * single rerouting shows up as one drift, not three unrelated-looking edges.
 */
export interface MiswiredDrift {
  readonly class: 'miswired';
  readonly slugs: readonly string[];
  readonly message: string;
  readonly edges: readonly MiswiredEdge[];
}

/** A single piece of drift `reconcile()` (spec §4) detected between an authored topology and its actual deployed state. */
export type Drift = PhantomDrift | OrphanDrift | DivergentDrift | MiswiredDrift;
