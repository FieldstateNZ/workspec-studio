import { Diagram } from '../schemas/diagram/diagram.js';
import { parseYamlArtifact } from './parse-core.js';
import type { ParseResult } from './parse-result.types.js';

/** Parses and validates `diagrams/<slug>.yaml` file text (thin or fat shape). */
export function parseDiagramYaml(text: string): ParseResult<Diagram> {
  return parseYamlArtifact(text, Diagram);
}
