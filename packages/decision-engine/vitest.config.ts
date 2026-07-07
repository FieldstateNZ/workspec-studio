import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Resolve @workspec/decision-schema to its TypeScript source so tests run
  // without a prior build.
  resolve: {
    alias: {
      '@workspec/decision-schema': fileURLToPath(
        new URL('../decision-schema/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    name: 'decision-engine',
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
