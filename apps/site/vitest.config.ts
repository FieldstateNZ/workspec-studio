import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// NOTE: deliberately NO workspace aliases here. Unlike the packages, the site
// resolves @workspec/* from the installed registry build, so its tests exercise
// the exact artifacts published to npm — a living integration test.
export default defineConfig({
  plugins: [react()],
  test: {
    name: 'site',
    environment: 'jsdom',
    // Testing Library's auto-cleanup between tests hooks into a global
    // `afterEach` — without it, renders from earlier tests in the same file
    // (now several: studio home, decisions, c4 stub, demo) pile up in the DOM
    // and role/heading queries start matching more than one element.
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
