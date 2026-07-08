import { defineConfig } from 'tsup';

/**
 * JS-only bundling for `@workspec/c4-schema`. Type declarations are emitted
 * separately by `tsc --emitDeclarationOnly` (see `tsconfig.build.json`) —
 * tsup's own `dts` option is disabled because TypeScript 6.0.3's declaration
 * emit for deep Zod-inferred types is more reliable than tsup's rolled-up
 * `.d.ts` generation for this shape of package.
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
