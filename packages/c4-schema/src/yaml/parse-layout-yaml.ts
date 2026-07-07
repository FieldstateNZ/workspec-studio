import { Layout } from '../schemas/layout/layout.js';
import { parseYamlArtifact } from './parse-core.js';
import type { ParseResult } from './parse-result.types.js';

/** Parses and validates a `diagrams/.layout/<diagram-slug>.yaml` file text. */
export function parseLayoutYaml(text: string): ParseResult<Layout> {
  return parseYamlArtifact(text, Layout);
}
