import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { workspaceAliases } from '../../vitest.aliases.js';

export default defineConfig({
  plugins: [react()],
  // Resolve sibling @workspec/* packages to their TypeScript source so tests
  // run without a prior build.
  resolve: {
    alias: workspaceAliases,
  },
  // Allow importing the example artifacts (outside this package) as `?raw`.
  server: {
    fs: {
      allow: ['../..'],
    },
  },
  test: {
    name: 'ui',
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
