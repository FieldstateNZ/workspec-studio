import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Single-project Vitest config, matching `@workspec/c4-model`'s shape. The
 * aliases resolve `@workspec/topology-schema` and `@workspec/schema-core` to
 * their TypeScript source so tests run without a prior build of either
 * dependency.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@workspec/topology-schema': fileURLToPath(
        new URL('../topology-schema/src/index.ts', import.meta.url),
      ),
      '@workspec/schema-core': fileURLToPath(
        new URL('../schema-core/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    fileParallelism: false,
  },
});
