import { isRecord } from './is-record.js';

/**
 * Reads `key` off a JSON object and returns it as a `string`, or `undefined`
 * if the key is absent or not a string. Guards every vendor-attribute read
 * (resource names, resource group names, provider type strings, …) so a
 * malformed or differently-shaped payload degrades to "field missing" rather
 * than throwing.
 */
export function asString(source: unknown, key: string): string | undefined {
  if (!isRecord(source)) return undefined;
  const value = source[key];
  return typeof value === 'string' ? value : undefined;
}
