import type { Resource } from '@workspec/topology-schema';
import { disambiguateDuplicateSlugs } from './disambiguate-duplicate-slugs.js';
import type { AdapterOutput, Diagnostic } from './types.js';

/** The shape every per-resource mapper (`mapTerraformResource`, `mapBicepResource`, `mapResourceGraphRow`) returns. */
export interface MappedItem {
  readonly resource?: Resource;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * The shared tail of every adapter: flattens each per-item mapping result
 * into resource/diagnostic lists, then runs the combined resource list
 * through `disambiguateDuplicateSlugs` before returning. Centralizing this
 * (rather than repeating the same fold-and-merge in all three adapters)
 * means every adapter gets duplicate-slug protection automatically, and a
 * future fourth adapter gets it for free too.
 */
export function finalizeAdapterOutput(mapped: readonly MappedItem[]): AdapterOutput {
  const resources: Resource[] = [];
  const diagnostics: Diagnostic[] = [];

  for (const item of mapped) {
    if (item.resource) resources.push(item.resource);
    diagnostics.push(...item.diagnostics);
  }

  const deduplicated = disambiguateDuplicateSlugs(resources);
  return {
    resources: deduplicated.resources,
    diagnostics: [...diagnostics, ...deduplicated.diagnostics],
  };
}
