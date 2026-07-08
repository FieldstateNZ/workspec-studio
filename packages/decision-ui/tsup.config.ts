import { defineConfig } from 'tsup';

// Library build: ESM for the JS entry only. `dist/styles.css` is NOT built
// here — the package.json build script chains @tailwindcss/cli over
// `src/index.css` (the Tailwind entry that composes the WorkSpec preset, the
// utilities the adopted @workspec/design components need, and the bespoke
// component styles), because the stylesheet now requires a Tailwind compile.
// React and TanStack Query are the host's — externalised so the remote (S6)
// and standalone hosts share single instances and no framework is bundled in.
// @workspec/design stays a regular dependency (tsup auto-externals deps).
// Type declarations are emitted separately by `tsc --emitDeclarationOnly` (see
// tsconfig.build.json + the `build` script) — tsup's own `dts` option is
// disabled, and `clean` stays off so this step doesn't wipe the .d.ts files
// tsc just wrote into the same `dist/`.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false,
  clean: false,
  sourcemap: true,
  external: ['react', 'react-dom', 'react/jsx-runtime', '@tanstack/react-query'],
});
