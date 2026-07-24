/**
 * One resource entry as it appears in `terraform show -json`'s
 * `values.root_module.resources[]` (or nested `child_modules[].resources[]`).
 * Loose by design: this is already-parsed vendor JSON, not a schema this
 * package owns, so only the fields the adapter actually reads are typed —
 * everything else stays inside the opaque `values` bag.
 */
export interface TerraformStateResource {
  /** Fully-qualified address, e.g. `"azurerm_linux_web_app.web"` or `"module.network.azurerm_subnet.workload"`. */
  readonly address: string;
  /** The `azurerm_*` resource type. */
  readonly type: string;
  /** The resource's local (non-module-qualified) name, e.g. `"web"`. */
  readonly name: string;
  /** The resource's current or planned attribute values. */
  readonly values: Record<string, unknown>;
}
