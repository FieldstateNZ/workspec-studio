import { asArray, asRecord, asString, isRecord, stringArray } from './json/index.js';
import type { PrivateEndpointTarget } from './private-endpoint-target.js';

/**
 * Reads an ARM private endpoint's `properties.privateLinkServiceConnections`
 * list into the shared `PrivateEndpointTarget` shape. Shared by the bicep
 * and azure-resource-graph adapters, both of which surface this property
 * under the same ARM `properties` shape.
 */
export function extractArmPrivateEndpointTargets(
  properties: Record<string, unknown>,
): readonly PrivateEndpointTarget[] | undefined {
  const connections = asArray(properties, 'privateLinkServiceConnections');
  if (!connections) return undefined;

  const targets = connections.filter(isRecord).map((connection): PrivateEndpointTarget => {
    const connectionProperties = asRecord(connection, 'properties');
    return {
      name: asString(connection, 'name'),
      resourceId: asString(connectionProperties, 'privateLinkServiceId'),
      subresourceNames: stringArray(asArray(connectionProperties, 'groupIds')),
    };
  });

  return targets.length > 0 ? targets : undefined;
}
