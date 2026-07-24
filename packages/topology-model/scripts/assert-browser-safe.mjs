// Post-build gate: the published root bundle (dist/index.js) must never
// import a Node builtin — neither `node:`-prefixed nor bare ('fs', 'path',
// ...). tsup bundles all relative imports, so any specifier left in the
// output is an external — and the only legitimate externals for the root
// entry are @workspec/topology-schema and @workspec/schema-core. Complements
// the static source-graph test in test/browser-safety.test.ts by checking
// the artifact that actually ships. Mirrors packages/c4-model's own guard.
import console from 'node:console';
import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const distIndex = join(dirname(fileURLToPath(import.meta.url)), '../dist/index.js');
const text = readFileSync(distIndex, 'utf8');

const NODE_BUILTINS = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);
const IMPORT_SPECIFIER = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

const offenders = Array.from(text.matchAll(IMPORT_SPECIFIER), (match) => match[1]).filter(
  (specifier) => NODE_BUILTINS.has(specifier) || specifier.startsWith('node:'),
);

if (offenders.length > 0) {
  console.error(
    `dist/index.js is not browser-safe — it imports Node builtins: ${offenders.join(', ')}`,
  );
  process.exit(1);
}
console.log('dist/index.js is browser-safe (no Node builtin imports)');
