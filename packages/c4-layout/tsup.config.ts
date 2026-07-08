import { defineConfig } from 'tsup';

/**
 * JS-only bundling for `@workspec/c4-layout`. Type declarations are emitted
 * separately by `tsc --emitDeclarationOnly` (see `tsconfig.build.json`) —
 * same split as `@workspec/c4-model`/`@workspec/c4-schema`, for the same
 * reason (TypeScript's own declaration emit is more reliable than tsup's
 * rolled-up `.d.ts` generation for this shape of package).
 *
 * Single entry, unlike c4-model's index/fs split: this package never
 * touches the filesystem — `layoutDiagram`/`layoutModel` are pure functions
 * over already-loaded `C4Model` data — so the whole package is browser-safe
 * and there's no Node-only subpath to keep separate. `@workspec/c4-model`,
 * `@workspec/c4-schema`, and `elkjs` all stay external (tsup's default for
 * package.json `dependencies`), which is what keeps `dist/index.js` free of
 * Node builtin imports (see `scripts/assert-browser-safe.mjs`).
 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  outDir: 'dist',
  dts: false,
  sourcemap: true,
  clean: false,
  target: 'es2022',
});
