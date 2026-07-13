import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'cost-schema',
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
