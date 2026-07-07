import { DomainElement } from '../schemas/domain.js';
import { parseYamlArtifact } from './parse-core.js';
import type { ParseResult } from './parse-result.types.js';

/** Parses and validates `domains/<slug>.yaml` file text. */
export function parseDomainYaml(text: string): ParseResult<DomainElement> {
  return parseYamlArtifact(text, DomainElement);
}
