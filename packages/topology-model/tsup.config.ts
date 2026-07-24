import { defineConfig } from 'tsup';

/**
 * JS-only bundling for `@workspec/topology-model`. Type declarations are
 * emitted separately by `tsc --emitDeclarationOnly` (see `tsconfig.build.json`)
 * — same split as `@workspec/c4-model`, for the same reason (TypeScript's own
 * declaration emit is more reliable than tsup's rolled-up `.d.ts` generation
 * for this shape of package).
 *
 * Two entries, matching the two package.json `exports` subpaths: `index.ts`
 * is the browser-safe root entry (MemorySource only); `fs.ts` is the
 * Node-only `./fs` subpath (FsSource, `node:fs/promises`). Keeping them as
 * separate tsup entries (rather than one bundle) is what makes the root
 * entry safe to load in a worker/browser condition that has no `node:`
 * module resolution — nothing in `fs.ts`'s import graph is pulled into
 * `index.js`.
 */
export default defineConfig({
  entry: ['src/index.ts', 'src/fs.ts'],
  format: ['esm'],
  outDir: 'dist',
  dts: false,
  sourcemap: true,
  clean: false,
  target: 'es2022',
});
