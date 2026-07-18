import { defineConfig } from 'tsup';

export default defineConfig([
  // Library entry: ESM, no shebang. Type declarations are emitted separately
  // by `tsc --emitDeclarationOnly` (see tsconfig.build.json + the `build`
  // script) — tsup's own `dts` option is disabled, and `clean` stays off so
  // this step doesn't wipe the .d.ts files tsc just wrote into the same
  // `dist/`.
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: false,
    clean: false,
    sourcemap: true,
  },
  // Executable entry: ESM with a Node shebang, no `.d.ts`.
  {
    entry: ['src/bin.ts'],
    format: ['esm'],
    dts: false,
    clean: false,
    sourcemap: true,
    banner: { js: '#!/usr/bin/env node' },
  },
]);
