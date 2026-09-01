import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

import { copyIndexForGitHubPages } from './src/copy-index-to-not-found.js';

// After the build, create both GitHub Pages' SPA fallback and a real static
// `/cost/demo/` entrypoint for the WebMCP challenge submission.
function githubPagesEntrypoints(): Plugin {
  return {
    name: 'github-pages-entrypoints',
    apply: 'build',
    closeBundle() {
      copyIndexForGitHubPages(fileURLToPath(new URL('dist', import.meta.url)));
    },
  };
}

// The site consumes the PUBLISHED @workspec/* packages from node_modules —
// no workspace-source aliases, no `@workspec/source` condition. Vite's
// default resolution picks each package's `import`/`browser` export (its
// dist build), which is exactly what an outside consumer would get from
// npm. EXCEPTION (temporary, S5 #121): the @workspec/c4-* packages are
// workspace:* devDependencies again until the canvas-recomposition alpha
// publishes — still consumed via each package's built dist through the pnpm
// symlink (no source aliases), so the consumption SHAPE stays
// registry-identical; only the tarball's origin differs. See package.json's
// `_LOUD_NOTICE_devDependencies_c4_packages` + docs/c4/drift-log.md entry
// 20. (Prior art: c4 retired the same exception at v0.1.0-alpha.2, cost at
// v0.1.0-alpha.5 — drift-log entries 17 / cost entry 1.)
export default defineConfig({
  base: '/',
  plugins: [tailwindcss(), react(), githubPagesEntrypoints()],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
