import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // Resolve sibling @workspec/* packages to their TypeScript source so tests
  // run without a prior build.
  resolve: {
    alias: {
      '@workspec/decision-schema': fileURLToPath(
        new URL('../decision-schema/src/index.ts', import.meta.url),
      ),
      '@workspec/decision-engine': fileURLToPath(
        new URL('../decision-engine/src/index.ts', import.meta.url),
      ),
    },
  },
  // Allow importing the example artifacts (outside this package) as `?raw`.
  server: {
    fs: {
      allow: ['../..'],
    },
  },
  test: {
    name: 'decision-ui',
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
