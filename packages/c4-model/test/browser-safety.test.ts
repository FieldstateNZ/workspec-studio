import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), '../src');
const IMPORT_SPECIFIER = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

/** Every Node builtin specifier, both bare ('fs', 'path') and `node:`-prefixed. */
const NODE_BUILTINS: ReadonlySet<string> = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]);

function isNodeBuiltin(specifier: string): boolean {
  return NODE_BUILTINS.has(specifier) || specifier.startsWith('node:');
}

/** Every module specifier a `.ts` file imports/exports-from, relative or bare. */
function importSpecifiers(filePath: string): string[] {
  const text = readFileSync(filePath, 'utf8');
  return Array.from(text.matchAll(IMPORT_SPECIFIER), (match) => match[1] as string);
}

/** Resolves a relative `./foo.js` / `../bar.js` specifier (as written, NodeNext-style) back to its `.ts` source file. */
function resolveRelative(fromFile: string, specifier: string): string {
  const resolved = join(dirname(fromFile), specifier);
  return resolved.endsWith('.js') ? `${resolved.slice(0, -3)}.ts` : resolved;
}

/** Every `.ts` file transitively reachable from `entryFile` by following only relative import specifiers. */
function reachableFrom(entryFile: string): Set<string> {
  const visited = new Set<string>();
  const stack = [entryFile];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || visited.has(current)) continue;
    visited.add(current);

    for (const specifier of importSpecifiers(current)) {
      if (specifier.startsWith('.')) {
        stack.push(resolveRelative(current, specifier));
      }
    }
  }

  return visited;
}

/**
 * `@workspec/c4-model`'s root entry (`src/index.ts`) must never reach a
 * Node builtin import — neither `node:`-prefixed nor bare (`'fs'`,
 * `'path'`, ...) — since that's what makes `MemorySource` usable in a
 * browser or worker with no Node module resolution at all. This statically
 * walks the relative-import graph from `src/index.ts` (the same graph a
 * bundler's root-entry chunk would contain) rather than requiring a prior
 * `pnpm build`, so it runs standalone in `pnpm test` on a fresh checkout.
 * The built artifact itself is checked by `scripts/assert-browser-safe.mjs`
 * as a post-build step.
 */
describe('root entry is browser-safe', () => {
  it('never reaches a Node builtin import (node:-prefixed or bare) from src/index.ts', () => {
    const reachable = reachableFrom(join(SRC_DIR, 'index.ts'));

    const offenders = Array.from(reachable).flatMap((file) =>
      importSpecifiers(file)
        .filter(isNodeBuiltin)
        .map((specifier) => `${file}: ${specifier}`),
    );

    expect(offenders).toEqual([]);
  });

  it('never reaches the Node-only FsSource module from src/index.ts', () => {
    const reachable = reachableFrom(join(SRC_DIR, 'index.ts'));
    const fsSourceFile = join(SRC_DIR, 'sources/fs-source.ts');

    expect(reachable.has(fsSourceFile)).toBe(false);
  });

  it('sanity check: the ./fs subpath entry does reach FsSource and node builtins', () => {
    const reachable = reachableFrom(join(SRC_DIR, 'fs.ts'));
    const fsSourceFile = join(SRC_DIR, 'sources/fs-source.ts');

    expect(reachable.has(fsSourceFile)).toBe(true);
    const hasNodeImport = Array.from(reachable).some((file) => importSpecifiers(file).some(isNodeBuiltin));
    expect(hasNodeImport).toBe(true);
  });

  it('sanity check: the guard itself recognizes both builtin spellings', () => {
    expect(isNodeBuiltin('fs')).toBe(true);
    expect(isNodeBuiltin('node:fs/promises')).toBe(true);
    expect(isNodeBuiltin('path')).toBe(true);
    expect(isNodeBuiltin('@workspec/c4-schema')).toBe(false);
    expect(isNodeBuiltin('./sources/memory-source.js')).toBe(false);
  });
});
