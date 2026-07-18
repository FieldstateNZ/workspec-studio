import { ACTOR_SCHEMA_URL } from '../constants.js';
import { ActorArtifact } from '../schemas/actor.js';
import { buildJsonSchema } from './build-json-schema.js';

/**
 * Builds every committed schema-core JSON Schema, keyed by the filename
 * it's written to under `json-schema/`. `scripts/gen-json-schema.ts` writes
 * this map to disk; the drift test regenerates it in-memory and asserts
 * byte-equality with what's committed.
 *
 * Each entry validates the *full envelope* (`apiVersion`/`kind`/`metadata`/
 * `spec`), not just the spec body — that's what a `.workspec/<kind-dir>/
 * <slug>.yaml` file actually contains on disk.
 */
export function buildAllJsonSchemas(): Record<string, unknown> {
  return {
    'actor.schema.json': buildJsonSchema(ActorArtifact, ACTOR_SCHEMA_URL, 'WorkSpec Actor (v1alpha1)'),
  };
}
