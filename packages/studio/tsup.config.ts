import { defineConfig } from 'tsup';

export default defineConfig([
  // Library entry: types + ESM, no shebang.
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    clean: true,
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
