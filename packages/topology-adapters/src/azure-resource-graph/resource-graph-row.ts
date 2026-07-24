/**
 * One row as it appears in an Azure Resource Graph query result's `data[]`
 * (the standard base columns every ARG query returns). Loose by design —
 * see `terraform/terraform-state-resource.ts` for the same rationale.
 */
export interface ResourceGraphRow {
  /** Full ARM resource ID — this row's stable provenance string. */
  readonly id: string;
  /** ARM resource type, e.g. `"microsoft.web/sites"` (ARG returns it lowercased). */
  readonly type: string;
  /** Resource name; parent-qualified for nested types (`"vnet/subnet"`). */
  readonly name: string;
  /** The resource group name (unqualified, not a resource ID). */
  readonly resourceGroup?: string | undefined;
  /** Disambiguates `Microsoft.Web/sites` (App Service vs. Function App). */
  readonly kind?: string | undefined;
  /** The resource's ARM properties bag. */
  readonly properties?: Record<string, unknown> | undefined;
}
