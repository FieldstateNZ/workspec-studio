import type {
  ConnectionType,
  ResourceCost,
  ResourceKindType,
  ResourceSourceType,
} from '@workspec/topology-schema';

// The `reconcile()` input describing "actual" — a resolved-topology-shaped
// view of one environment's deployed state, paired against that same
// environment's authored `ResolvedTopology`. Defined here rather than
// imported from `@workspec/topology-model` because there is no `resolve()`
// step on this side: a future CLI/studio phase builds a `DerivedTopology`
// straight from `@workspec/topology-adapters` output (the demo's
// `.topology-actual/<env>/` tree) — there are no environment overrides to
// merge, since this is observed state, not an authored artifact plus a
// patch.

/**
 * One resource observed in the deployed estate, flattened to the same shape
 * `@workspec/topology-model`'s `ResolvedResource` uses for an authored
 * resource, so `reconcile()` can treat both sides uniformly. This is a
 * direct field lift out of a derived `Resource`'s `.spec` (see
 * `@workspec/topology-schema`'s `ResourceSpec`) — not a `resolve()`-shaped
 * merge, since there is no environment-override patch on the actual side.
 *
 * `network`/`realizes` are deliberately omitted: neither the matcher
 * (`match-resources.ts`) nor any drift rule (spec §4) consults them, and
 * carrying a field recon never reads would invite a future consumer to lean
 * on data this package makes no claims about.
 */
export interface DerivedResource {
  readonly slug: string;
  readonly name: string;
  readonly kind: ResourceKindType;
  readonly type: string;
  readonly provider: string;
  /**
   * `null` both when a vendor payload genuinely has no resource-group concept
   * for this resource, and when the producing adapter can't observe one at
   * all — `@workspec/topology-adapters`' README documents that its bicep
   * adapter never sets this (an ARM template has no deployment-scope field).
   * The matcher treats `null` on either side as a wildcard for exactly this
   * reason: it can't tell "no resource group" from "unobservable resource
   * group" apart, so it must not treat either as a hard non-match.
   */
  readonly resourceGroup: string | null;
  readonly config: Record<string, unknown> | null;
  readonly cost: ResourceCost | null;
  readonly source: ResourceSourceType | null;
}

/** One edge observed in the deployed estate. Same shape as `ResolvedConnection`. */
export interface DerivedConnection {
  readonly from: string;
  readonly to: string;
  readonly class: ConnectionType['class'];
}

/**
 * A resolved-topology-shaped view of one environment's actual deployed
 * state — the other half of a `reconcile()` call, paired against a
 * `ResolvedTopology` for the same `envSlug`. Built by a future CLI/studio
 * phase from `@workspec/topology-adapters` output; this package only
 * consumes the shape, it never derives it from raw vendor payloads itself
 * (that would duplicate `topology-adapters`' job, not recon's).
 *
 * `connections` is OPTIONAL, and the distinction between "absent" and
 * "present but empty" is load-bearing: `undefined` means connectivity was
 * never observed for this environment (e.g. an adapter-imported tree built
 * from resources alone — no `@workspec/topology-adapters` adapter infers
 * edges), so `reconcile()` must not assess wiring at all — treating an
 * unobserved graph as an empty one would flag every authored edge as a false
 * "authored-only" miswire. A present array (including `[]`) means
 * connectivity WAS captured and is authoritative: a legitimately edge-free
 * actual state is reported as every authored edge missing, exactly as today.
 */
export interface DerivedTopology {
  readonly envSlug: string;
  readonly resources: readonly DerivedResource[];
  readonly connections?: readonly DerivedConnection[];
}
