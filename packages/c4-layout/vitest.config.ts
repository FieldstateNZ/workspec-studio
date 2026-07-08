import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Single-project Vitest config, matching `@workspec/c4-model`'s shape. The
 * aliases resolve `@workspec/c4-model` (root + `./fs` subpath, the latter
 * needed only by tests — they build fixture input with `createFsSource`/
 * `loadC4Model`, never shipped in `src`) and `@workspec/c4-schema` to their
 * TypeScript source so tests run without a prior build of either package.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@workspec/c4-model/fs': fileURLToPath(new URL('../c4-model/src/fs.ts', import.meta.url)),
      '@workspec/c4-model': fileURLToPath(new URL('../c4-model/src/index.ts', import.meta.url)),
      '@workspec/c4-schema': fileURLToPath(new URL('../c4-schema/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    fileParallelism: false,
  },
});
