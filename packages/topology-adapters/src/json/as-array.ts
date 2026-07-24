import { isRecord } from './is-record.js';

/**
 * Reads `key` off a JSON object and returns it as a `readonly unknown[]`, or
 * `undefined` if the key is absent or not an array. Used for list-shaped
 * vendor attributes (Terraform's `address_space`/`address_prefixes`, an ARM
 * `private_service_connection` list, an ARG `data[]` result set, …).
 */
export function asArray(source: unknown, key: string): readonly unknown[] | undefined {
  if (!isRecord(source)) return undefined;
  const value = source[key];
  return Array.isArray(value) ? value : undefined;
}
