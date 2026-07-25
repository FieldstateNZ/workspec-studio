import { asString } from '../json/index.js';
import { lastPathSegment } from '../last-path-segment.js';
import { toSlug } from '../slug.js';
import type { VendorKindKey } from '../vendor-kind-catalog.js';

/**
 * Derives a resource's `network` ref (the vnet/subnet resource that places
 * it in the network-lens view) from its Terraform attributes, where
 * inferable:
 *
 * - A subnet's own `network` is its parent vnet, read off `virtual_network_name`.
 * - A private endpoint's `network` is the subnet it lands in, read off the
 *   last path segment of `subnet_id`.
 *
 * Every other kind returns `undefined` — Terraform state doesn't reliably
 * carry a network placement for e.g. an App Service (VNet integration is a
 * separate `azurerm_app_service_virtual_network_swift_connection` resource,
 * out of scope for this adapter) or a SQL database, so no ref is guessed.
 *
 * Judgment call: both derivations assume the referenced vnet/subnet's Azure
 * `name` attribute is what its own slug is derived from (see
 * `map-terraform-resource.ts`) — true whenever the state's naming is
 * internally consistent, which is the common case, but not schema-enforced.
 */
export function deriveTerraformNetwork(
  catalogKey: VendorKindKey,
  attrs: Record<string, unknown>,
): string | undefined {
  if (catalogKey === 'subnet') {
    const vnetName = asString(attrs, 'virtual_network_name');
    return vnetName ? toSlug(vnetName) : undefined;
  }

  if (catalogKey === 'privateEndpoint') {
    const subnetId = asString(attrs, 'subnet_id');
    const segment = subnetId ? lastPathSegment(subnetId) : undefined;
    return segment ? toSlug(segment) : undefined;
  }

  return undefined;
}
