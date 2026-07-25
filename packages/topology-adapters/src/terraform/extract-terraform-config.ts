import { asArray, asNumber, asString, stringArray } from '../json/index.js';
import type { VendorKindKey } from '../vendor-kind-catalog.js';
import { extractTerraformPrivateEndpointTargets } from './extract-terraform-private-endpoint-targets.js';

/**
 * Curated, per-kind subset of a Terraform resource's `values` copied into
 * `ResourceSpec.config`. Deliberately not "copy every attribute" — `config`
 * is an open bag by schema, but a faithful mirror of Terraform's full
 * (often large, provider-internal) attribute set would defeat the point of
 * a curated view. Returns `undefined` when the kind has no curated fields or
 * none of them were present, so callers can omit `config` entirely rather
 * than writing `{}`.
 */
export function extractTerraformConfig(
  catalogKey: VendorKindKey,
  attrs: Record<string, unknown>,
): Record<string, unknown> | undefined {
  switch (catalogKey) {
    case 'redisCache':
    case 'redisEnterprise':
      return pruned({
        skuName: asString(attrs, 'sku_name'),
        family: asString(attrs, 'family'),
        capacity: asNumber(attrs, 'capacity'),
      });

    case 'sqlDatabase':
      return pruned({ sku: asString(attrs, 'sku_name') });

    case 'virtualNetwork':
      return pruned({ addressSpace: stringArray(asArray(attrs, 'address_space')) });

    case 'subnet':
      return pruned({
        prefix:
          stringArray(asArray(attrs, 'address_prefixes'))?.[0] ?? asString(attrs, 'address_prefix'),
      });

    case 'privateEndpoint':
      return pruned({ targets: extractTerraformPrivateEndpointTargets(attrs) });

    case 'storage':
      return pruned({
        accountTier: asString(attrs, 'account_tier'),
        accountReplicationType: asString(attrs, 'account_replication_type'),
      });

    case 'search':
      return pruned({ sku: asString(attrs, 'sku') });

    default:
      return undefined;
  }
}

/** Drops `undefined` entries; returns `undefined` (not `{}`) when nothing survives. */
function pruned(config: Record<string, unknown>): Record<string, unknown> | undefined {
  const entries = Object.entries(config).filter(([, value]) => value !== undefined);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}
