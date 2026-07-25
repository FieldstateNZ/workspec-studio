import { asArray, asRecord, asString, isRecord } from '../json/index.js';
import type { BicepTemplateResource } from './bicep-template-resource.js';

/**
 * Extracts the flat list of resources from a parsed compiled-ARM-template
 * document (`resources[]`). Returns an empty list (never throws) when
 * `resources` is missing or not an array.
 */
export function collectBicepResources(input: unknown): BicepTemplateResource[] {
  const entries = asArray(input, 'resources') ?? [];
  const resources: BicepTemplateResource[] = [];

  for (const entry of entries) {
    if (!isRecord(entry)) continue;
    const type = asString(entry, 'type');
    const name = asString(entry, 'name');
    if (!type || !name) continue;
    resources.push({
      type,
      name,
      kind: asString(entry, 'kind'),
      properties: asRecord(entry, 'properties'),
    });
  }

  return resources;
}
