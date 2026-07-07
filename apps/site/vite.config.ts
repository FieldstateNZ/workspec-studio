import { copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// After the build, copy index.html → 404.html so client-routed deep links like
// `/demo` resolve on GitHub Pages (which serves 404.html for unknown paths).
function spaFallback(): Plugin {
  return {
    name: 'spa-404-fallback',
    apply: 'build',
    closeBundle() {
      const index = fileURLToPath(new URL('dist/index.html', import.meta.url));
      if (existsSync(index)) {
        copyFileSync(index, fileURLToPath(new URL('dist/404.html', import.meta.url)));
      }
    },
  };
}

// The site consumes the PUBLISHED @workspec/* packages from node_modules — no
// workspace-source aliases, no `@workspec/source` condition. Vite's default
// resolution picks each package's `import`/`browser` export (its dist build),
// which is exactly what an outside consumer would get from npm.
export default defineConfig({
  base: '/',
  plugins: [react(), spaFallback()],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
