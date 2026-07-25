import { isRecord } from './is-record.js';

/**
 * Reads `key` off a JSON object and returns it as a `number`, or `undefined`
 * if the key is absent or not a number. Used for small numeric vendor
 * attributes copied into `config` (a Redis cache's `capacity`, …).
 */
export function asNumber(source: unknown, key: string): number | undefined {
  if (!isRecord(source)) return undefined;
  const value = source[key];
  return typeof value === 'number' ? value : undefined;
}
