import { defineConfig } from 'tsup';

// Library build: ESM for the JS entry only. `dist/styles.css` is NOT built
// here — the package.json build script chains @tailwindcss/cli over
// `src/index.css` (the Tailwind entry that composes the WorkSpec preset and
// the scoped `.wsc-root` preflight stand-in), because the stylesheet
// requires a Tailwind compile. React is the host's — externalised so any
// host (including a future module-federation composition through
// @workspec/c4-ui) shares a single instance and no framework is bundled
// in. `@workspec/design`, `zustand`, `zod`, `nanoid` and
// `fractional-indexing-jittered` stay regular dependencies (tsup
// auto-externals deps). Type declarations are emitted separately by
// `tsc --emitDeclarationOnly` (see tsconfig.build.json + the `build`
// script) — tsup's own `dts` option is disabled, and `clean` stays off so
// this step doesn't wipe the .d.ts files tsc just wrote into the same
// `dist/`. Mirrors packages/topology-ui/tsup.config.ts.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false,
  clean: false,
  sourcemap: true,
  external: ['react', 'react-dom', 'react/jsx-runtime'],
});
