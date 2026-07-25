/**
 * Recovers the leaf resource name from an ARM resource `name`, which for a
 * nested resource type (e.g. `Microsoft.Network/virtualNetworks/subnets`) is
 * written parent-qualified as `"parentName/childName"` by both compiled
 * Bicep templates and Azure Resource Graph results. Returns the input
 * unchanged when it isn't `/`-qualified.
 */
export function armLocalName(name: string): string {
  if (!name.includes('/')) return name;
  return name.split('/').at(-1) ?? name;
}
