import type { Resource } from '@workspec/topology-schema';

/**
 * Step 4 of the `resolve()` contract (spec §3.3): for every surviving
 * `resource-group`-kind resource, computes its resolved display name —
 * `<rg-slug><suffix>` (e.g. `"rg-app"` + `"-prod"` -> `"rg-app-prod"") when
 * the environment declares `naming.resourceGroupSuffix`, or just the slug
 * unchanged otherwise. The RG resource's own authored `spec.name` (e.g.
 * `"App resource group"`, a human title) is untouched — this is a distinct,
 * naming-convention-derived name for the underlying cloud resource group,
 * exposed separately so a consumer can show both.
 */
export function computeResourceGroupNames(
  survivors: ReadonlyMap<string, Resource>,
  resourceGroupSuffix: string | null,
): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  for (const [slug, resource] of survivors) {
    if (resource.spec.kind !== 'resource-group') continue;
    names.set(slug, resourceGroupSuffix ? `${slug}${resourceGroupSuffix}` : slug);
  }
  return names;
}
