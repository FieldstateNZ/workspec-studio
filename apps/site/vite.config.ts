import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

import { copyIndexToNotFound } from './src/copy-index-to-not-found.js';

// After the build, copy index.html → 404.html so client-routed deep links —
// `/decisions`, `/decisions/demo`, `/c4` — resolve on GitHub Pages (which
// serves 404.html for unknown paths).
function spaFallback(): Plugin {
  return {
    name: 'spa-404-fallback',
    apply: 'build',
    closeBundle() {
      copyIndexToNotFound(fileURLToPath(new URL('dist', import.meta.url)));
    },
  };
}

// The site consumes the PUBLISHED @workspec/* packages from node_modules —
// no workspace-source aliases, no `@workspec/source` condition. Vite's
// default resolution picks each package's `import`/`browser` export (its
// dist build), which is exactly what an outside consumer would get from
// npm. (The four @workspec/c4-* packages spent one release cycle as a
// workspace:* exception here — retired at v0.1.0-alpha.2, see
// docs/c4/drift-log.md entry 17.)
export default defineConfig({
  base: '/',
  plugins: [tailwindcss(), react(), spaFallback()],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
