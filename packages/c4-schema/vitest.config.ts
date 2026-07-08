import { defineConfig } from 'vitest/config';

/**
 * Single-project Vitest config. Everything here is pure schema/YAML logic
 * with no I/O beyond reading fixture files from disk, so there is no need
 * for the multi-project (unit/integration/web) split used by DB-backed
 * Fieldstate packages.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    fileParallelism: false,
  },
});
