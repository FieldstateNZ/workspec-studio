import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'trace-studio',
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
