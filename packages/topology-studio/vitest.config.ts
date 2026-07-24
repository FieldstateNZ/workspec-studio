import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Resolve sibling @workspec/* packages to their TypeScript source so tests
// run without a prior build.
export default defineConfig({
  resolve: {
    alias: {
      '@workspec/decision-schema': fileURLToPath(
        new URL('../decision-schema/src/index.ts', import.meta.url),
      ),
      '@workspec/topology-adapters': fileURLToPath(
        new URL('../topology-adapters/src/index.ts', import.meta.url),
      ),
      '@workspec/topology-cost': fileURLToPath(
        new URL('../topology-cost/src/index.ts', import.meta.url),
      ),
      '@workspec/topology-model/fs': fileURLToPath(
        new URL('../topology-model/src/fs.ts', import.meta.url),
      ),
      '@workspec/topology-model': fileURLToPath(
        new URL('../topology-model/src/index.ts', import.meta.url),
      ),
      '@workspec/topology-recon': fileURLToPath(
        new URL('../topology-recon/src/index.ts', import.meta.url),
      ),
      '@workspec/topology-schema': fileURLToPath(
        new URL('../topology-schema/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    name: 'topology-studio',
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
