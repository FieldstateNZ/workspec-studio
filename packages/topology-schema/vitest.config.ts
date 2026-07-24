import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'topology-schema',
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
