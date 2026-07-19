import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Resolve sibling @workspec/* packages to their TypeScript source so tests
  // run without a prior build (their package.json "exports" point at dist/,
  // which the clean-tree gate removes). Mirrors @workspec/cost-studio.
  resolve: {
    alias: {
      '@workspec/schema-core': fileURLToPath(
        new URL('../schema-core/src/index.ts', import.meta.url),
      ),
      '@workspec/req-schema': fileURLToPath(new URL('../req-schema/src/index.ts', import.meta.url)),
      '@workspec/trace-model': fileURLToPath(
        new URL('../trace-model/src/index.ts', import.meta.url),
      ),
      '@workspec/trace-emitters': fileURLToPath(
        new URL('../trace-emitters/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    name: 'trace-studio',
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
