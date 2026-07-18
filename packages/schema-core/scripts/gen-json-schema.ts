import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAllJsonSchemas } from '../src/json-schema/build-all-json-schemas.js';
import { serializeJsonSchema } from '../src/json-schema/serialize-json-schema.js';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outputDir = join(packageRoot, 'json-schema');

/**
 * Regenerates every committed schema-core JSON Schema under `json-schema/`.
 * Run via `pnpm --filter @workspec/schema-core run gen:schema` after any
 * schema change — the drift test fails CI if the committed files fall out
 * of sync with what this script would produce.
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
