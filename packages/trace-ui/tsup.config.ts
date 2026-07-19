import { defineConfig } from 'tsup';

// Library build: ESM for the JS entry only. `dist/styles.css` is NOT built
// here — the package.json build script chains @tailwindcss/cli over
// `src/index.css` instead (see that script + src/index.css's own doc
// comment). React and TanStack Query are the host's — externalised so every
// consumer shares single instances and no framework is bundled in.
// @workspec/design/@workspec/trace-model/@workspec/req-schema stay regular
// dependencies (tsup auto-externals deps). Type declarations are emitted
// separately by `tsc --emitDeclarationOnly` (see tsconfig.build.json + the
// `build` script) — tsup's own `dts` option is disabled, and `clean` stays
// off so this step doesn't wipe the .d.ts files tsc just wrote into the same
// `dist/`. Mirrors packages/cost-ui/tsup.config.ts.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false,
  clean: false,
  sourcemap: true,
  external: ['react', 'react-dom', 'react/jsx-runtime', '@tanstack/react-query'],
});
