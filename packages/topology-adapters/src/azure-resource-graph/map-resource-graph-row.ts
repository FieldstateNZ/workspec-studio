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
import type { ResourceGraphRow } from './resource-graph-row.js';

/** Outcome of mapping one Resource Graph row: `resource` is set unless the type was unmapped, alongside zero or more diagnostics. */
export interface MapResourceGraphRowResult {
  readonly resource?: Resource;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Maps one Azure Resource Graph result row to a `Resource` artifact, or to a
 * diagnostic when its `type` has no vendor→kind mapping. `source.from` is
 * the row's full ARM resource `id` — ARG's own natural stable identifier.
 */
export function mapResourceGraphRow(row: ResourceGraphRow): MapResourceGraphRowResult {
  const catalogKey = resolveArmCatalogKey(row.type, row.kind);
  if (!catalogKey) {
    return { diagnostics: [unmappedTypeDiagnostic(row.type, row.id)] };
  }

  const entry = VENDOR_KIND_CATALOG[catalogKey];
  const localName = armLocalName(row.name);
  const diagnostics: Diagnostic[] = [];
  if (isArmWebSitesType(row.type) && row.kind === undefined) {
    diagnostics.push(defaultedWebSiteKindDiagnostic(row.id));
  }

  return {
    resource: buildDerivedResource({
      slug: toSlug(localName),
      name: localName,
      kind: entry.kind,
      type: entry.type,
      provider: 'azure',
      resourceGroup: row.resourceGroup ? toSlug(row.resourceGroup) : undefined,
      network: deriveArmNetwork(catalogKey, row.name, row.properties),
      config: extractArmConfig(catalogKey, row.properties),
      from: row.id,
    }),
    diagnostics,
  };
}
