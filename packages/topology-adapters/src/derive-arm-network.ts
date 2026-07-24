import { asRecord, asString } from './json/index.js';
import { lastPathSegment } from './last-path-segment.js';
import { toSlug } from './slug.js';
import type { VendorKindKey } from './vendor-kind-catalog.js';

/**
 * Derives a resource's `network` ref from ARM-shaped attributes, shared by
 * the bicep and azure-resource-graph adapters:
 *
 * - A subnet's own `network` is its parent vnet, read off the
 *   parent-qualified `name` (`"core-vnet/snet-workload"` → `"core-vnet"`).
 * - A private endpoint's `network` is the subnet it lands in, read off the
 *   last path segment of `properties.subnet.id`.
 *
 * Every other kind returns `undefined` — see the equivalent Terraform
 * judgment call in `terraform/derive-terraform-network.ts`, which applies
 * here too.
 */
export function deriveArmNetwork(
  catalogKey: VendorKindKey,
  name: string,
  properties: Record<string, unknown> | undefined,
): string | undefined {
  if (catalogKey === 'subnet') {
    return name.includes('/') ? toSlug(name.split('/')[0] ?? name) : undefined;
  }

  if (catalogKey === 'privateEndpoint') {
    const subnetId = asString(asRecord(properties, 'subnet'), 'id');
    const segment = subnetId ? lastPathSegment(subnetId) : undefined;
    return segment ? toSlug(segment) : undefined;
  }

  return undefined;
}
