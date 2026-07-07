import { defineConfig } from 'vitest/config';

// Workspace-root Vitest config. Each package (and app) contributes a project via
// its own vitest.config.ts; `vitest run` here executes them all, while
// `pnpm -r test` runs each in isolation. `apps/*` includes the site's demo, which
// runs against the PUBLISHED @workspec/* packages (its config uses no source aliases).
export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*'],
  },
});
