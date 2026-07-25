import { finalizeAdapterOutput } from '../finalize-adapter-output.js';
import type { AdapterOutput } from '../types.js';
import { collectTerraformResources } from './collect-terraform-resources.js';
import { mapTerraformResource } from './map-terraform-resource.js';

/**
 * The terraform import adapter: consumes an already-parsed `terraform show
 * -json` document (state or plan) and produces the `Resource` artifacts it
 * can map, plus a diagnostic for every resource whose `azurerm_*` type has
 * no entry in the vendor→kind mapping table. Pure — no filesystem or network
 * IO; the caller reads `terraform show -json` and passes the parsed object.
 *
 * Walks `values.root_module` (falling back to `planned_values.root_module`
 * for a plan document) and every nested `child_modules[]`, so resources
 * declared inside a Terraform module are picked up the same as root-level
 * ones. Resources that map to the same `metadata.slug` (e.g. two
 * same-named resources in different resource groups) are disambiguated —
 * see `disambiguateDuplicateSlugs`.
 */
export function terraformAdapter(input: unknown): AdapterOutput {
  const stateResources = collectTerraformResources(input);
  return finalizeAdapterOutput(stateResources.map(mapTerraformResource));
}
