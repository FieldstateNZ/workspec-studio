import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Resolve @workspec/cost-schema to its TypeScript source so tests run
  // without a prior build.
  resolve: {
    alias: {
      '@workspec/cost-schema': fileURLToPath(
        new URL('../cost-schema/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    name: 'cost-provider',
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
