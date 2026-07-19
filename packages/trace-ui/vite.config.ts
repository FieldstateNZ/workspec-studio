import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The standalone DEV STORY (T5 brief: "a small standalone entry / story… so
// the views can be viewed in a browser — for design review screenshots").
// Serves `dev/index.html`, which mounts `TraceApp` over a seeded fixture
// `TraceModel` via `createMemoryRepository` — no backend, no CLI, nothing
// outside this package. Distinct from `vite.config.mf.ts` (the module-
// federation REMOTE build) — this is a plain Vite app, run with
// `pnpm --filter @workspec/trace-ui dev`.
//
// Resolves the sibling `@workspec/*` packages to their TypeScript source
// (mirrors `vitest.config.ts`) so the story runs without a prior build of
// trace-model/req-schema/schema-core.
export default defineConfig({
  root: fileURLToPath(new URL('./dev', import.meta.url)),
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      '@workspec/trace-model': fileURLToPath(
        new URL('../trace-model/src/index.ts', import.meta.url),
      ),
      '@workspec/req-schema': fileURLToPath(new URL('../req-schema/src/index.ts', import.meta.url)),
      '@workspec/schema-core': fileURLToPath(
        new URL('../schema-core/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    port: 5183,
    // `root` is nested (`dev/`), but `dev/main.tsx` imports this package's own
    // `../src/*` — explicitly allow the monorepo root so Vite's dev-server
    // fs guard doesn't reject those sibling-directory reads.
    fs: {
      allow: [fileURLToPath(new URL('../..', import.meta.url))],
    },
  },
});
