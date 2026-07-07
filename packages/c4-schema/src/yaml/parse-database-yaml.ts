import { C4Element } from '../schemas/c4-element.js';
import { parseYamlArtifact } from './parse-core.js';
import type { ParseResult } from './parse-result.types.js';

/** Parses and validates `databases/<slug>.yaml` file text. */
export function parseDatabaseYaml(text: string): ParseResult<C4Element> {
  return parseYamlArtifact(text, C4Element);
}
