import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// No sibling @workspec/* source aliases are needed here (unlike
// packages/topology-ui): @workspec/canvas has no workspace TypeScript
// dependencies — its only @workspec dependency is the published
// @workspec/design CSS/token package, which tests never import.
export default defineConfig({
  plugins: [react()],
  test: {
    name: 'canvas',
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
