import type { ConnectionType, ResourceCost, ResourceKindType, ResourceSourceType } from '@workspec/topology-schema';

/**
 * One surviving resource after `resolve()`: the resource's display fields
 * flattened out of `Resource.spec` (ergonomic for the UI and for recon/cost,
 * which want `slug`/`kind`/`config`/`cost` directly rather than reaching
 * through `.resource.spec`), with `config`/`cost` already deep-merged
 * against the target environment's `overrides` (step 3 of the resolve
 * contract). `network`/`resourceGroup` are the *original* placement refs —
 * resolve() never rewrites them; lens-tree building is what turns a ref into
 * a nesting relationship.
 */
export interface ResolvedResource {
  readonly slug: string;
  readonly name: string;
  readonly kind: ResourceKindType;
  readonly type: string;
  readonly provider: string;
  readonly network: string | null;
  readonly resourceGroup: string | null;
  readonly realizes: readonly string[];
  /** `spec.config`, deep-merged against this environment's override patch (arrays replace; `null` when the resource has neither). */
  readonly config: Record<string, unknown> | null;
  /** `spec.cost`, deep-merged against this environment's override patch (`null` when the resource has neither). */
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
