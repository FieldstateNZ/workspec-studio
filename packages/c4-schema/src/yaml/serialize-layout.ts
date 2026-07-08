import { stringify } from 'yaml';
import type { Layout } from '../schemas/layout/layout.js';

/**
 * Serializes a validated `Layout` back to YAML text. Paired with
 * `parseLayoutYaml` for the round-trip test (parse -> serialize -> parse
 * -> deep-equal) that guards against the schema and the serializer
 * drifting apart.
 */
export function serializeLayout(layout: Layout): string {
  return stringify(layout);
}
