import { defineConfig } from 'vitest/config';

/**
 * Single-project Vitest config. Everything here is pure schema/path logic
 * with no I/O beyond reading fixture files from disk (the conformance
 * suite), so there is no need for a multi-project split.
 */
export default defineConfig({
  test: {
    name: 'schema-core',
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    fileParallelism: false,
  },
});
