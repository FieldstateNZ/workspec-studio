import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Resolve sibling @workspec/* packages to their TypeScript source (including
  // c4-model's Node-only `./fs` subpath) so tests run without a prior build.
  resolve: {
    alias: {
      '@workspec/canvas': fileURLToPath(new URL('../canvas/src/index.ts', import.meta.url)),
      '@workspec/c4-schema': fileURLToPath(new URL('../c4-schema/src/index.ts', import.meta.url)),
      '@workspec/c4-model/fs': fileURLToPath(new URL('../c4-model/src/fs.ts', import.meta.url)),
      '@workspec/c4-model': fileURLToPath(new URL('../c4-model/src/index.ts', import.meta.url)),
      '@workspec/c4-layout': fileURLToPath(new URL('../c4-layout/src/index.ts', import.meta.url)),
      '@workspec/c4-ui': fileURLToPath(new URL('../c4-ui/src/index.ts', import.meta.url)),
    },
  },
  test: {
    name: 'c4-studio',
    environment: 'node',
    // Client (shell) component tests live under client/ and opt into jsdom
    // per-file via the `@vitest-environment jsdom` docblock; everything
    // under src/ stays node.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'client/**/*.test.tsx'],
    setupFiles: ['./vitest.setup.ts'],
  },
});
