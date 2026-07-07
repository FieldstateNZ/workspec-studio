// Generate the committed JSON Schema files from the Zod source of truth.
//
//   pnpm --filter @workspec/decision-schema gen:schema   (or: pnpm gen:schema)
//
// Writes `json-schema/decision.schema.json` and `json-schema/catalog.schema.json`
// at the repo root. The drift test regenerates these in-memory and fails CI if
// they differ from what is committed.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAllJsonSchemas, serializeJsonSchema } from '../src/json-schema.js';

// scripts/ → schema/ → packages/ → <repo root>/json-schema/
const outDir = fileURLToPath(new URL('../../../json-schema/', import.meta.url));
mkdirSync(outDir, { recursive: true });

const schemas = buildAllJsonSchemas();
for (const [filename, schema] of Object.entries(schemas)) {
  const target = join(outDir, filename);
  writeFileSync(target, serializeJsonSchema(schema), 'utf8');
  console.log(`wrote ${target}`);
}
