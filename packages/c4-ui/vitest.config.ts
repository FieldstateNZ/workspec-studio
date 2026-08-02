import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // Resolve sibling @workspec/* packages to their TypeScript source so tests
  // run without a prior build — mirrors packages/decision-ui/vitest.config.ts
  // and the c4-* siblings' own vitest configs.
  resolve: {
    alias: {
      '@workspec/c4-schema': fileURLToPath(new URL('../c4-schema/src/index.ts', import.meta.url)),
      '@workspec/c4-model': fileURLToPath(new URL('../c4-model/src/index.ts', import.meta.url)),
      '@workspec/c4-layout': fileURLToPath(new URL('../c4-layout/src/index.ts', import.meta.url)),
      '@workspec/canvas': fileURLToPath(new URL('../canvas/src/index.ts', import.meta.url)),
      '@workspec/canvas-c4': fileURLToPath(new URL('../canvas-c4/src/index.ts', import.meta.url)),
    },
  },
  test: {
    name: 'c4-ui',
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
