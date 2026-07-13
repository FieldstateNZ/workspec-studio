import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Resolve sibling @workspec/* packages to their TypeScript source so tests
  // run without a prior build.
  resolve: {
    alias: {
      '@workspec/cost-engine': fileURLToPath(
        new URL('../cost-engine/src/index.ts', import.meta.url),
      ),
      '@workspec/cost-provider-azure': fileURLToPath(
        new URL('../cost-provider-azure/src/index.ts', import.meta.url),
      ),
      '@workspec/cost-provider': fileURLToPath(
        new URL('../cost-provider/src/index.ts', import.meta.url),
      ),
      '@workspec/cost-schema': fileURLToPath(
        new URL('../cost-schema/src/index.ts', import.meta.url),
      ),
      '@workspec/cost-ui': fileURLToPath(new URL('../cost-ui/src/index.ts', import.meta.url)),
    },
  },
  test: {
    name: 'cost-studio',
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
