import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // Resolve sibling @workspec/* packages to their TypeScript source so tests
  // run without a prior build.
  resolve: {
    alias: {
      '@workspec/cost-engine': fileURLToPath(
        new URL('../cost-engine/src/index.ts', import.meta.url),
      ),
      '@workspec/cost-schema': fileURLToPath(
        new URL('../cost-schema/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    name: 'cost-ui',
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
