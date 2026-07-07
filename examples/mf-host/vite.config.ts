import { federation } from '@module-federation/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The S6 smoke HOST: a minimal Vite app that consumes @workspec/decision-ui as a
// module-federation remote. It declares the SAME shared singletons the remote
// declares (react / react-dom / react/jsx-runtime / @tanstack/react-query) — the
// host owns one copy of each and the remote borrows it, so there is exactly one
// React and one react-query across the boundary. That is what lets the remote's
// hooks run and the provider's QueryClient reach the views' `useQuery`.
//
// The remote entry is a root-relative URL (`/remote/remoteEntry.js`): the smoke
// server (serve.ts) serves the built remote under `/remote/` on the same origin,
// so no port is baked into this build. Remote type consumption is disabled
// (`dts: false`) — the remote is not running at build time; types come from the
// hand-written `src/remotes.d.ts`.

const REACT_RANGE = '^18.3';
const REACT_QUERY_RANGE = '^5.0.0';

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'mfHost',
      remotes: {
        decisionStudio: {
          type: 'module',
          name: 'decisionStudio',
          entry: '/remote/remoteEntry.js',
        },
      },
      shared: {
        react: { singleton: true, requiredVersion: REACT_RANGE },
        'react-dom': { singleton: true, requiredVersion: REACT_RANGE },
        'react/jsx-runtime': { singleton: true, requiredVersion: REACT_RANGE },
        '@tanstack/react-query': { singleton: true, requiredVersion: REACT_QUERY_RANGE },
      },
      dts: false,
    }),
  ],
  build: {
    // Module federation's runtime uses top-level await.
    target: 'esnext',
    minify: false,
  },
  server: {
    // Allow `?raw` imports of the hosting-platform fixtures, which live outside this package.
    fs: { allow: ['../..'] },
  },
});
