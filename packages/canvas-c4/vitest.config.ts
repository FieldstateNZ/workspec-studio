import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Resolve sibling @workspec/* packages to their TypeScript source so tests
// run without a prior build — mirrors packages/c4-ui/vitest.config.ts.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@workspec/c4-schema': fileURLToPath(new URL('../c4-schema/src/index.ts', import.meta.url)),
      '@workspec/c4-model': fileURLToPath(new URL('../c4-model/src/index.ts', import.meta.url)),
      '@workspec/c4-layout': fileURLToPath(new URL('../c4-layout/src/index.ts', import.meta.url)),
      '@workspec/canvas': fileURLToPath(new URL('../canvas/src/index.ts', import.meta.url)),
    },
  },
  test: {
    name: 'canvas-c4',
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
