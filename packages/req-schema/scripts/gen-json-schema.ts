import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serializeJsonSchema } from '@workspec/schema-core';
import { buildAllJsonSchemas } from '../src/json-schema/build-all-json-schemas.js';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outputDir = join(packageRoot, 'json-schema');

/**
 * Regenerates every committed req-schema JSON Schema under `json-schema/`.
 * Run via `pnpm --filter @workspec/req-schema run gen:schema` after any schema
 * change — the drift test fails CI if the committed files fall out of sync
 * with what this script would produce. Serialization is shared from
 * `@workspec/schema-core` so this package and schema-core emit byte-identical
 * formatting.
 */
async function main(): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  const schemas = buildAllJsonSchemas();
  await Promise.all(
    Object.entries(schemas).map(([filename, schema]) =>
      writeFile(join(outputDir, filename), serializeJsonSchema(schema), 'utf8'),
    ),
  );
  console.log(`Wrote ${Object.keys(schemas).length} JSON Schema(s) to ${outputDir}`);
}

await main();
