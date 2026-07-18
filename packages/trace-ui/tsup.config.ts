import { defineConfig } from 'tsup';

// JS-only bundling. Type declarations are emitted separately by
// `tsc --emitDeclarationOnly` (see tsconfig.build.json + the `build` script) —
// tsup's own `dts` option is disabled, and `clean` stays off so this step
// doesn't wipe the .d.ts files tsc just wrote into the same `dist/`.
//
// T0 bootstrap skeleton: no `external` list yet (no React/TanStack Query
// imports to keep out of the bundle). Add `external: ['react', 'react-dom',
// 'react/jsx-runtime', '@tanstack/react-query']` (mirrors
// packages/cost-ui/tsup.config.ts) once the real views land in T5. Likewise,
// `dist/styles.css` (via `@tailwindcss/cli` over `src/index.css`) and the
// module-federation remote (`build:mf` / `vite.config.mf.ts`) are deferred
// to that slice — see the package README.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false,
  clean: false,
  sourcemap: true,
});
