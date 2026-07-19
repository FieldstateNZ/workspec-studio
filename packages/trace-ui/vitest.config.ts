import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // Resolve sibling @workspec/* packages to their TypeScript source so tests
  // run without a prior build (mirrors packages/cost-ui/vitest.config.ts).
  resolve: {
    alias: {
      '@workspec/trace-model': fileURLToPath(
        new URL('../trace-model/src/index.ts', import.meta.url),
      ),
      '@workspec/req-schema': fileURLToPath(new URL('../req-schema/src/index.ts', import.meta.url)),
      '@workspec/schema-core': fileURLToPath(
        new URL('../schema-core/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    name: 'trace-ui',
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
