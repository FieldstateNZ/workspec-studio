import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'trace-emitters',
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
