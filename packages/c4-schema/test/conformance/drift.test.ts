import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildAllJsonSchemas } from '../../src/json-schema/build-all-json-schemas.js';
import { serializeJsonSchema } from '../../src/json-schema/serialize-json-schema.js';

const jsonSchemaDir = join(dirname(fileURLToPath(import.meta.url)), '../../json-schema/c4');

/**
 * Regenerates every JSON Schema in-memory and asserts byte-equality with
 * what's committed under `json-schema/c4/`. CI fails this test the moment
 * a schema change lands without a matching `pnpm gen:schema` run.
 */
describe('JSON Schema drift', () => {
  const schemas = buildAllJsonSchemas();

  it.each(Object.entries(schemas))('%s matches the committed file byte-for-byte', (filename, schema) => {
    const committed = readFileSync(join(jsonSchemaDir, filename), 'utf8');
    const regenerated = serializeJsonSchema(schema);
    expect(regenerated).toBe(committed);
  });

  it('covers exactly the twelve committed schema files, no more, no fewer', () => {
    expect(Object.keys(schemas).sort()).toEqual(
      [
        'actor.schema.json',
        'component.schema.json',
        'container.schema.json',
        'database.schema.json',
        'diagram.schema.json',
        'domain.schema.json',
        'external-system.schema.json',
        'feature.schema.json',
        'layout.schema.json',
        'queue.schema.json',
        'spec.schema.json',
        'system.schema.json',
      ].sort(),
    );
  });
});
