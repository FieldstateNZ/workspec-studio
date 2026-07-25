import type { Resource } from '@workspec/topology-schema';

/**
 * Step 1 of the `resolve()` contract (spec §3.3): drops any resource whose
 * `spec.environments` is present AND does not include `envSlug`. Omitted
 * `environments` means present in ALL environments — **absence is
 * meaningful and must never be treated as an empty list**, per
 * `ResourceSpec.environments`'s own doc comment in `@workspec/topology-schema`.
 */
export function pruneResources(
  resources: ReadonlyMap<string, Resource>,
  envSlug: string,
): ReadonlyMap<string, Resource> {
  const survivors = new Map<string, Resource>();
  for (const [slug, resource] of resources) {
    const scope = resource.spec.environments;
    if (scope === undefined || scope.includes(envSlug)) {
      survivors.set(slug, resource);
    }
  }
  return survivors;
}
