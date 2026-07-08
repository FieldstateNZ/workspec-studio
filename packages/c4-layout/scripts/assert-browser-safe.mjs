// Post-build gate. Checks exactly ONE thing: the published bundle
// (dist/index.js) imports no Node builtin — neither `node:`-prefixed nor
// bare ('fs', 'path', ...). tsup bundles all relative imports, so any
// specifier left in the output is an external — and the only legitimate
// externals for this package are @workspec/c4-model, @workspec/c4-schema,
// and elkjs's bundled build. It does NOT scan for DOM globals
// (document/window) — that half of the browser/Node-portability contract
// lives in test/browser-safety.test.ts's source-graph scan; this script
// covers the Node-builtin half against the artifact that actually ships.
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
  console.error(`dist/index.js imports Node builtins: ${offenders.join(', ')}`);
  process.exit(1);
}
console.log(
  'dist/index.js imports no Node builtins (DOM-global check lives in test/browser-safety.test.ts)',
);
