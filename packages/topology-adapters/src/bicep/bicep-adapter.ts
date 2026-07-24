import { finalizeAdapterOutput } from '../finalize-adapter-output.js';
import type { AdapterOutput } from '../types.js';
import { collectBicepResources } from './collect-bicep-resources.js';
import { mapBicepResource } from './map-bicep-resource.js';

/**
 * The bicep import adapter: consumes an already-parsed compiled ARM template
 * document (the output of `bicep build`/`az bicep build`, i.e. `resources[]`
 * with ARM `type` strings) and produces the `Resource` artifacts it can map,
 * plus a diagnostic for every resource whose ARM `type` has no entry in the
 * vendor→kind mapping table. Pure — no filesystem or network IO. Resources
 * that map to the same `metadata.slug` are disambiguated — see
 * `disambiguateDuplicateSlugs`.
 */
export function bicepAdapter(input: unknown): AdapterOutput {
  const templateResources = collectBicepResources(input);
  return finalizeAdapterOutput(templateResources.map(mapBicepResource));
}
