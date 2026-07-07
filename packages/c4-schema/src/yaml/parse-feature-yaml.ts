import { FeatureElement } from '../schemas/feature.js';
import { parseYamlArtifact } from './parse-core.js';
import type { ParseResult } from './parse-result.types.js';

/** Parses and validates `features/<slug>.yaml` file text. */
export function parseFeatureYaml(text: string): ParseResult<FeatureElement> {
  return parseYamlArtifact(text, FeatureElement);
}
