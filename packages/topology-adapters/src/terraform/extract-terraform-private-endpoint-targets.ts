import { asArray, asString, isRecord, stringArray } from '../json/index.js';
import type { PrivateEndpointTarget } from '../private-endpoint-target.js';

/**
 * Reads an `azurerm_private_endpoint`'s `private_service_connection` list
 * (one entry per connection, though in practice almost always exactly one)
 * into the shared `PrivateEndpointTarget` shape for `config.targets`.
 */
export function extractTerraformPrivateEndpointTargets(
  attrs: Record<string, unknown>,
): readonly PrivateEndpointTarget[] | undefined {
  const connections = asArray(attrs, 'private_service_connection');
  if (!connections) return undefined;

  const targets = connections.filter(isRecord).map((connection): PrivateEndpointTarget => ({
    name: asString(connection, 'name'),
    resourceId: asString(connection, 'private_connection_resource_id'),
    subresourceNames: stringArray(asArray(connection, 'subresource_names')),
  }));

  return targets.length > 0 ? targets : undefined;
}
