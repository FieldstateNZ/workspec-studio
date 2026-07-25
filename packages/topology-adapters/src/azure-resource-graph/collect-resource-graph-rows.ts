import { asArray, asRecord, asString, isRecord } from '../json/index.js';
import type { ResourceGraphRow } from './resource-graph-row.js';

/**
 * Extracts the flat list of rows from a parsed Azure Resource Graph query
 * result (`data[]`). Returns an empty list (never throws) when `data` is
 * missing or not an array, or when a row lacks the minimum `id`/`type`/`name`
 * columns an adapter needs.
 */
export function collectResourceGraphRows(input: unknown): ResourceGraphRow[] {
  const entries = asArray(input, 'data') ?? [];
  const rows: ResourceGraphRow[] = [];

  for (const entry of entries) {
    if (!isRecord(entry)) continue;
    const id = asString(entry, 'id');
    const type = asString(entry, 'type');
    const name = asString(entry, 'name');
    if (!id || !type || !name) continue;
    rows.push({
      id,
      type,
      name,
      resourceGroup: asString(entry, 'resourceGroup'),
      kind: asString(entry, 'kind'),
      properties: asRecord(entry, 'properties'),
    });
  }

  return rows;
}
