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
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
