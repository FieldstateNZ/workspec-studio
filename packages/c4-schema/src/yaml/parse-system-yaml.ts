import { SystemElement } from '../schemas/system.js';
import { parseYamlArtifact } from './parse-core.js';
import type { ParseResult } from './parse-result.types.js';

/** Parses and validates the singleton `system/<slug>.yaml` file text. */
export function parseSystemYaml(text: string): ParseResult<SystemElement> {
  return parseYamlArtifact(text, SystemElement);
}
