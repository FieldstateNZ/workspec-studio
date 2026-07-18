import { defineConfig } from 'tsup';

// JS-only bundling. Type declarations are emitted separately by
// `tsc --emitDeclarationOnly` (see tsconfig.build.json + the `build` script) —
// tsup's own `dts` option is disabled, and `clean` stays off so this step
// doesn't wipe the .d.ts files tsc just wrote into the same `dist/`.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false,
  clean: false,
  sourcemap: true,
  target: 'es2022',
});
