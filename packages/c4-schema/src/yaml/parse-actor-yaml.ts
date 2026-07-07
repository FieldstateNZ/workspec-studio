import { ActorElement } from '../schemas/actor.js';
import { parseYamlArtifact } from './parse-core.js';
import type { ParseResult } from './parse-result.types.js';

/** Parses and validates `actors/<slug>.yaml` file text. */
export function parseActorYaml(text: string): ParseResult<ActorElement> {
  return parseYamlArtifact(text, ActorElement);
}
