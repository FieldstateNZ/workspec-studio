import { readFileSync, readdirSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Unlike `@workspec/c4-model` (which splits a Node-only `FsSource` behind a
// `./fs` subpath so its root stays loadable in a browser), this package has
// no Node-only part at all: the provider PORT and its memory double are pure
// data + Map bookkeeping. So this test is simpler than c4-model's — it just
// asserts NO non-test source file in this package reaches a Node builtin
// import, which is what makes `createMemoryProvider` usable in a browser or
// worker (e.g. inside cost-ui) with no `node:` module resolution at all.

const SRC_DIR = dirname(fileURLToPath(import.meta.url));
const IMPORT_SPECIFIER = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

const NODE_BUILTINS: ReadonlySet<string> = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]);

function isNodeBuiltin(specifier: string): boolean {
  return NODE_BUILTINS.has(specifier) || specifier.startsWith('node:');
}

function nonTestSourceFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .map((name) => join(dir, name));
}

describe('package is browser-safe', () => {
  it('no non-test source file imports a Node builtin (node:-prefixed or bare)', () => {
    const files = nonTestSourceFiles(SRC_DIR);
    expect(files.length).toBeGreaterThan(0); // sanity: the glob actually found source files

    const offenders = files.flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      const specifiers = Array.from(text.matchAll(IMPORT_SPECIFIER), (match) => match[1] as string);
      return specifiers.filter(isNodeBuiltin).map((specifier) => `${file}: ${specifier}`);
    });

    expect(offenders).toEqual([]);
  });

  it('sanity check: the guard itself recognizes both builtin spellings', () => {
    expect(isNodeBuiltin('fs')).toBe(true);
    expect(isNodeBuiltin('node:fs/promises')).toBe(true);
    expect(isNodeBuiltin('path')).toBe(true);
    expect(isNodeBuiltin('@workspec/cost-schema')).toBe(false);
    expect(isNodeBuiltin('./memory.js')).toBe(false);
  });
});
