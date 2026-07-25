/**
 * One resource entry as it appears in a compiled ARM template's
 * `resources[]` (the output of `bicep build`/`az bicep build`). Loose by
 * design — see `terraform/terraform-state-resource.ts` for the same
 * rationale.
 */
export interface BicepTemplateResource {
  /** ARM resource type, e.g. `"Microsoft.Web/sites"`. */
  readonly type: string;
  /** Resource name; parent-qualified for nested types (`"vnet/subnet"`). */
  readonly name: string;
  /** Disambiguates `Microsoft.Web/sites` (App Service vs. Function App). */
  readonly kind?: string | undefined;
  /** The resource's ARM properties bag. */
  readonly properties?: Record<string, unknown> | undefined;
}
