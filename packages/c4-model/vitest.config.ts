import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Single-project Vitest config, matching `@workspec/c4-schema`'s shape.
 * The alias resolves `@workspec/c4-schema` to its TypeScript source so
 * tests run without a prior build of that package.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@workspec/c4-schema': fileURLToPath(new URL('../c4-schema/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    fileParallelism: false,
  },
});
