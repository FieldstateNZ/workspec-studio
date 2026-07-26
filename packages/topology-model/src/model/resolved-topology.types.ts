import type {
  ConnectionType,
  ResourceCost,
  ResourceKindType,
  ResourceSourceType,
} from '@workspec/topology-schema';

/**
 * One surviving resource after `resolve()`: the resource's display fields
 * flattened out of `Resource.spec` (ergonomic for the UI and for recon/cost,
 * which want `slug`/`kind`/`config`/`cost` directly rather than reaching
 * through `.resource.spec`), with every overridable field already merged
 * against the resource's OWN `spec.overrides[envSlug]` patch (S1, step 3 of
 * the resolve contract — see `resolve()`'s own doc comment for the full
 * per-field merge rule). **`network`/`resourceGroup` are POST-OVERRIDE
 * values, not the raw authored refs**: `resolve()` DOES rewrite them when an
 * override names them (e.g. a resource pooled into a shared dev resource
 * group but an isolated prod one) — every downstream consumer (lens-tree
 * building, recon, cost) reads the resolved placement, never the base
 * resource's own `spec.network`/`spec.resourceGroup` directly.
 */
export interface ResolvedResource {
  readonly slug: string;
  readonly name: string;
  readonly kind: ResourceKindType;
  readonly type: string;
  readonly provider: string;
  /** `spec.network`, replaced wholesale by `spec.overrides[envSlug].network` when present (`null` when neither names one). */
  readonly network: string | null;
  /** `spec.resourceGroup`, replaced wholesale by `spec.overrides[envSlug].resourceGroup` when present (`null` when neither names one). */
  readonly resourceGroup: string | null;
  readonly realizes: readonly string[];
  /**
   * `spec.config`, SHALLOW-merged (top-level keys only — NOT deep/recursive)
   * against `spec.overrides[envSlug].config`: a key named in the override
   * replaces the base value at that key wholesale, even when both are
   * objects; a key not named inherits the base value unchanged. `null` when
   * the resource has neither a base `config` nor an applicable override.
   */
  readonly config: Record<string, unknown> | null;
  /**
   * `spec.cost`, field-by-field merged (`sku`/`mode`/`schedule`/`qty`/`attribution`)
   * against `spec.overrides[envSlug].cost` — `attribution` is a whole-array
   * replace when the override names it, never an element-wise splice. `null`
   * when the resource has no `cost` binding and the override can't
   * manufacture a whole one on its own (see `mergeCost`'s doc comment).
   */
  readonly cost: ResourceCost | null;
  readonly source: ResourceSourceType | null;
}

/** One surviving connection after `resolve()`: unchanged from its authored shape, minus the now-redundant per-connection `environments` scoping. */
export interface ResolvedConnection {
  readonly from: string;
  readonly to: string;
  readonly class: ConnectionType['class'];
}

/** The target environment's naming conventions, applied. */
export interface ResolvedNaming {
  /** `Environment.spec.naming.resourceGroupSuffix`, or `null` when the environment declares none. */
  readonly resourceGroupSuffix: string | null;
}

/**
 * The output of `resolve()` — THE NORMATIVE CONTRACT every downstream
 * consumer (lens trees, recon, cost) takes instead of a raw `Topology`.
 * Carries the surviving resources (config/cost already merged) and
 * connections for one environment, that environment's naming conventions,
 * and a pre-computed display-name map for every surviving `resource-group`
 * resource (`<rg-slug><suffix>`, e.g. `"rg-app-prod"` — the resource's own
 * `name` field, e.g. `"App resource group"`, is untouched; this is an
 * additional, naming-convention-derived display name for the resolved
 * infrastructure resource-group, not a replacement for it).
 */
export interface ResolvedTopology {
  readonly envSlug: string;
  readonly title: string;
  readonly provider: string;
  readonly catalog: string | null;
  /** Surviving resources, sorted by slug for deterministic snapshots. */
  readonly resources: readonly ResolvedResource[];
  /** Surviving connections, in the topology's original declaration order. */
  readonly connections: readonly ResolvedConnection[];
  readonly naming: ResolvedNaming;
  /** `resource-group`-kind resource slug -> resolved display name (`<rg-slug><suffix>`). Only entries for surviving resource-group resources. */
  readonly resourceGroupNames: ReadonlyMap<string, string>;
}
