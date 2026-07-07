import { ExternalSystemElement } from '../schemas/external-system.js';
import { parseYamlArtifact } from './parse-core.js';
import type { ParseResult } from './parse-result.types.js';

/** Parses and validates `external-systems/<slug>.yaml` file text. */
export function parseExternalSystemYaml(text: string): ParseResult<ExternalSystemElement> {
  return parseYamlArtifact(text, ExternalSystemElement);
}
