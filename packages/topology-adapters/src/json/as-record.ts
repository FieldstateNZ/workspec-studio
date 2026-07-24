import { isRecord } from './is-record.js';

/**
 * Reads `key` off a JSON object and returns it as a nested
 * `Record<string, unknown>`, or `undefined` if the key is absent or not an
 * object. Used throughout the adapters to descend into nested JSON (e.g. a
 * Terraform resource's `values`, an ARM resource's `properties`) without ever
 * widening to `any`.
 */
export function asRecord(source: unknown, key: string): Record<string, unknown> | undefined {
  if (!isRecord(source)) return undefined;
  const value = source[key];
  return isRecord(value) ? value : undefined;
}
