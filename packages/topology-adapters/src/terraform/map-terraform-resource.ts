import { asString } from '../json/index.js';
import { buildDerivedResource } from '../build-derived-resource.js';
import { unmappedTypeDiagnostic } from '../diagnostics/unmapped-type-diagnostic.js';
import { toSlug } from '../slug.js';
import { VENDOR_KIND_CATALOG } from '../vendor-kind-catalog.js';
import type { Diagnostic } from '../types.js';
import type { Resource } from '@workspec/topology-schema';
import { deriveTerraformNetwork } from './derive-terraform-network.js';
import { extractTerraformConfig } from './extract-terraform-config.js';
import type { TerraformStateResource } from './terraform-state-resource.js';
import { resolveTerraformCatalogKey } from './terraform-type-map.js';

/** Outcome of mapping one Terraform state resource: `resource` is set unless the type was unmapped, alongside zero or more diagnostics. */
export interface MapTerraformResourceResult {
  readonly resource?: Resource;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Maps one `terraform show -json` resource entry to a `Resource` artifact,
 * or to a diagnostic when its `type` has no vendor→kind mapping.
 *
 * Slug/name judgment call: both are derived from the resource's Azure
 * `name` attribute (`values.name`) when present, falling back to the
 * Terraform-local resource name (the last segment of `address`) otherwise —
 * *not* from the Terraform-local name unconditionally. This keeps
 * cross-resource refs self-consistent: `resourceGroup`/`network` are also
 * slugified from Azure-name-shaped attributes (`resource_group_name`,
 * `virtual_network_name`), so a resource and the things that reference it
 * resolve to the same slug only if both sides use the same name source.
 */
export function mapTerraformResource(resource: TerraformStateResource): MapTerraformResourceResult {
  const catalogKey = resolveTerraformCatalogKey(resource.type);
  if (!catalogKey) {
    return { diagnostics: [unmappedTypeDiagnostic(resource.type, resource.address)] };
  }

  const entry = VENDOR_KIND_CATALOG[catalogKey];
  const attrs = resource.values;
  const localName = resource.address.split('.').at(-1) ?? resource.name;
  const azureName = asString(attrs, 'name') ?? localName;
  const resourceGroupName = asString(attrs, 'resource_group_name');

  return {
    resource: buildDerivedResource({
      slug: toSlug(azureName),
      name: azureName,
      kind: entry.kind,
      type: entry.type,
      provider: 'azure',
      network: deriveTerraformNetwork(catalogKey, attrs),
      resourceGroup: resourceGroupName ? toSlug(resourceGroupName) : undefined,
      config: extractTerraformConfig(catalogKey, attrs),
      from: resource.address,
    }),
    diagnostics: [],
  };
}
