import { defineConfig } from 'tsup';

// Library build: ESM for the JS entry only. `dist/styles.css` is NOT built
// here — the package.json build script chains @tailwindcss/cli over
// `src/index.css` (the Tailwind entry that composes the WorkSpec preset plus
// the bespoke canvas/panel/header styles), because the stylesheet requires a
// Tailwind compile. React is the host's — externalised so a
// module-federation remote (this package's `build:mf`) and any standalone
// host share a single instance and no framework is bundled in.
// @workspec/topology-model / topology-schema / design stay regular
// dependencies (tsup auto-externals deps). Type declarations are emitted
// separately by `tsc --emitDeclarationOnly` (see tsconfig.build.json + the
// `build` script) — tsup's own `dts` option is disabled, and `clean` stays
// off so this step doesn't wipe the .d.ts files tsc just wrote into the
// same `dist/`. Mirrors packages/c4-ui/tsup.config.ts and
// packages/decision-ui/tsup.config.ts exactly.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false,
  clean: false,
  sourcemap: true,
  external: ['react', 'react-dom', 'react/jsx-runtime', '@tanstack/react-query'],
});
