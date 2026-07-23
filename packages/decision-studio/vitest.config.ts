import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Resolve sibling @workspec/* packages to their TypeScript source so tests
  // run without a prior build.
  resolve: {
    alias: {
      '@workspec/decision-schema': fileURLToPath(
        new URL('../decision-schema/src/index.ts', import.meta.url),
      ),
      '@workspec/decision-engine': fileURLToPath(
        new URL('../decision-engine/src/index.ts', import.meta.url),
      ),
      '@workspec/decision-ui': fileURLToPath(
        new URL('../decision-ui/src/index.ts', import.meta.url),
      ),
      '@workspec/mcp-core': fileURLToPath(new URL('../mcp-core/src/index.ts', import.meta.url)),
    },
  },
  test: {
    name: 'decision-studio',
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
