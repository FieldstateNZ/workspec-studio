import type { Resource } from '@workspec/topology-schema';
import { armLocalName } from '../arm-local-name.js';
import { isArmWebSitesType, resolveArmCatalogKey } from '../arm-type-map.js';
import { buildDerivedResource } from '../build-derived-resource.js';
import { deriveArmNetwork } from '../derive-arm-network.js';
import { defaultedWebSiteKindDiagnostic } from '../diagnostics/defaulted-web-site-kind-diagnostic.js';
import { unmappedTypeDiagnostic } from '../diagnostics/unmapped-type-diagnostic.js';
import { extractArmConfig } from '../extract-arm-config.js';
import { toSlug } from '../slug.js';
import type { Diagnostic } from '../types.js';
import { VENDOR_KIND_CATALOG } from '../vendor-kind-catalog.js';
import type { BicepTemplateResource } from './bicep-template-resource.js';

/** Outcome of mapping one ARM template resource: `resource` is set unless the type was unmapped, alongside zero or more diagnostics. */
export interface MapBicepResourceResult {
  readonly resource?: Resource;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Maps one compiled-ARM-template resource to a `Resource` artifact, or to a
 * diagnostic when its `type` has no vendor→kind mapping.
 *
 * `resourceGroup` is deliberately left unset: an ARM template resource
 * doesn't carry its own deployment resource-group scope (that's supplied at
 * deploy time, outside the template JSON), unlike Terraform state
 * (`resource_group_name`) or an Azure Resource Graph row (`resourceGroup`
 * column). A later CLI phase that knows the deployment target could inject
 * it; this adapter, given only the template, cannot.
 */
export function mapBicepResource(resource: BicepTemplateResource): MapBicepResourceResult {
  const from = `${resource.type}:${resource.name}`;
  const catalogKey = resolveArmCatalogKey(resource.type, resource.kind);
  if (!catalogKey) {
    return { diagnostics: [unmappedTypeDiagnostic(resource.type, from)] };
  }

  const entry = VENDOR_KIND_CATALOG[catalogKey];
  const localName = armLocalName(resource.name);
  const diagnostics: Diagnostic[] = [];
  if (isArmWebSitesType(resource.type) && resource.kind === undefined) {
    diagnostics.push(defaultedWebSiteKindDiagnostic(from));
  }

  return {
    resource: buildDerivedResource({
      slug: toSlug(localName),
      name: localName,
      kind: entry.kind,
      type: entry.type,
      provider: 'azure',
      network: deriveArmNetwork(catalogKey, resource.name, resource.properties),
      config: extractArmConfig(catalogKey, resource.properties),
      from,
    }),
    diagnostics,
  };
}
