import { asArray, asRecord, asString, isRecord } from '../json/index.js';
import type { TerraformStateResource } from './terraform-state-resource.js';

/**
 * Recursively flattens a `terraform show -json` module tree
 * (`root_module.resources[]` plus every nested `child_modules[].resources[]`)
 * into a single list. Terraform already qualifies a child module resource's
 * `address` with its module path (e.g. `"module.network.azurerm_subnet.workload"`),
 * so flattening loses no addressing information.
 */
function collectFromModule(module: Record<string, unknown>): TerraformStateResource[] {
  const resources: TerraformStateResource[] = [];

  for (const entry of asArray(module, 'resources') ?? []) {
    const address = asString(entry, 'address');
    const type = asString(entry, 'type');
    const name = asString(entry, 'name');
    if (!address || !type || !name) continue; // malformed entry; caller has no diagnostic hook here, so it's silently dropped — the per-resource mapper never sees it.
    resources.push({ address, type, name, values: asRecord(entry, 'values') ?? {} });
  }

  for (const childModule of asArray(module, 'child_modules') ?? []) {
    if (isRecord(childModule)) resources.push(...collectFromModule(childModule));
  }

  return resources;
}

/**
 * Extracts the flat list of resources from a parsed `terraform show -json`
 * document. Accepts either a state document (`values.root_module`) or a plan
 * document (`planned_values.root_module`), preferring `values` when both are
 * present. Returns an empty list (never throws) when the expected root shape
 * is absent — the caller (`terraformAdapter`) is responsible for surfacing
 * that as a diagnostic.
 */
export function collectTerraformResources(input: unknown): TerraformStateResource[] {
  const root = asRecord(input, 'values') ?? asRecord(input, 'planned_values');
  const rootModule = asRecord(root, 'root_module');
  if (!rootModule) return [];
  return collectFromModule(rootModule);
}
