import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'trace-ui',
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
