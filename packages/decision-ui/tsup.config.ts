import { defineConfig } from 'tsup';

// Library build: ESM for the JS entry, plus a compiled `styles.css`.
// React and TanStack Query are the host's — externalised so the remote (S6) and
// standalone hosts share single instances and no framework is bundled in.
// Type declarations are emitted separately by `tsc --emitDeclarationOnly` (see
// tsconfig.build.json + the `build` script) — tsup's own `dts` option is
// disabled, and `clean` stays off so this step doesn't wipe the .d.ts files
// tsc just wrote into the same `dist/`.
export default defineConfig({
  entry: ['src/index.ts', 'src/styles.css'],
  format: ['esm'],
  dts: false,
  clean: false,
  sourcemap: true,
  external: ['react', 'react-dom', 'react/jsx-runtime', '@tanstack/react-query'],
});
