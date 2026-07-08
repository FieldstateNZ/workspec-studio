import { Spec } from '../schemas/spec/spec.js';
import { parseYamlArtifact } from './parse-core.js';
import type { ParseResult } from './parse-result.types.js';

/** Parses and validates the singleton `spec.yaml` file text. */
export function parseSpecYaml(text: string): ParseResult<Spec> {
  return parseYamlArtifact(text, Spec);
}
