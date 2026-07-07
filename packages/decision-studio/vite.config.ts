import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Builds the browser client (the host shell) into `dist/client`, which the
// Express server serves. Separate from the CLI/server build (tsup) — this is the
// only Vite target in the package. `@workspec/decision-ui` resolves to its built
// dist (default conditions), so the same compiled UI runs in the browser here
// and as the module-federation remote (S6).
export default defineConfig({
  root: fileURLToPath(new URL('./client', import.meta.url)),
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL('./dist/client', import.meta.url)),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:4173',
    },
  },
});
