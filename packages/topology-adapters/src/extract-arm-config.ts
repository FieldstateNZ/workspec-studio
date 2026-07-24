import { asArray, asNumber, asRecord, asString, stringArray } from './json/index.js';
import { extractArmPrivateEndpointTargets } from './extract-arm-private-endpoint-targets.js';
import type { VendorKindKey } from './vendor-kind-catalog.js';

/**
 * Curated, per-kind subset of an ARM resource's `properties` copied into
 * `ResourceSpec.config`. Shared by the bicep and azure-resource-graph
 * adapters, both of which read the same ARM `properties` shape (unlike
 * Terraform's differently-named attributes — see
 * `terraform/extract-terraform-config.ts`). Returns `undefined` when the
 * kind has no curated fields or none were present.
 */
export function extractArmConfig(
  catalogKey: VendorKindKey,
  properties: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!properties) return undefined;

  switch (catalogKey) {
    case 'redisCache':
    case 'redisEnterprise': {
      const sku = asRecord(properties, 'sku');
      return pruned({
        skuName: asString(sku, 'name'),
        family: asString(sku, 'family'),
        capacity: asNumber(sku, 'capacity'),
      });
    }

    case 'sqlDatabase':
    case 'storage':
    case 'search':
      return pruned({ sku: asString(asRecord(properties, 'sku'), 'name') });

    case 'virtualNetwork':
      return pruned({
        addressSpace: stringArray(asArray(asRecord(properties, 'addressSpace'), 'addressPrefixes')),
      });

    case 'subnet':
      return pruned({ prefix: asString(properties, 'addressPrefix') });

    case 'privateEndpoint':
      return pruned({ targets: extractArmPrivateEndpointTargets(properties) });

    default:
      return undefined;
  }
}

/** Drops `undefined` entries; returns `undefined` (not `{}`) when nothing survives. */
function pruned(config: Record<string, unknown>): Record<string, unknown> | undefined {
  const entries = Object.entries(config).filter(([, value]) => value !== undefined);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}
