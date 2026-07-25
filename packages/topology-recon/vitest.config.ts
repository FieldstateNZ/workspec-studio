import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'topology-recon',
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
  },
});
