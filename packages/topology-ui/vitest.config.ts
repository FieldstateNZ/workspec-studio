import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // Resolve sibling @workspec/* packages to their TypeScript source so tests
  // run without a prior build.
  resolve: {
    alias: {
      '@workspec/topology-model': fileURLToPath(
        new URL('../topology-model/src/index.ts', import.meta.url),
      ),
      '@workspec/topology-schema': fileURLToPath(
        new URL('../topology-schema/src/index.ts', import.meta.url),
      ),
      '@workspec/topology-recon': fileURLToPath(
        new URL('../topology-recon/src/index.ts', import.meta.url),
      ),
      '@workspec/topology-cost': fileURLToPath(
        new URL('../topology-cost/src/index.ts', import.meta.url),
      ),
      '@workspec/decision-schema': fileURLToPath(
        new URL('../decision-schema/src/index.ts', import.meta.url),
      ),
    },
  },
  // The test-helpers fixture reader reads @workspec/topology-schema's golden
  // fixture files straight off disk (see src/test-helpers/read-web-app-fixture.ts) —
  // allow Vite's dev server to serve outside this package's root.
  server: {
    fs: {
      allow: ['../..'],
    },
  },
  test: {
    name: 'topology-ui',
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
