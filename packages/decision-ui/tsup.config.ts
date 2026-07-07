import { defineConfig } from 'tsup';

// Library build: ESM + types for the JS entry, plus a compiled `styles.css`.
// React and TanStack Query are the host's — externalised so the remote (S6) and
// standalone hosts share single instances and no framework is bundled in.
export default defineConfig({
  entry: ['src/index.ts', 'src/styles.css'],
  format: ['esm'],
  dts: { entry: 'src/index.ts' },
  clean: true,
  sourcemap: true,
  external: ['react', 'react-dom', 'react/jsx-runtime', '@tanstack/react-query'],
});
