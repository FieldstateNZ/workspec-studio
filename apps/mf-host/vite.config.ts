import { federation } from '@module-federation/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The S6 smoke HOST: a minimal Vite app that consumes @workspec/decision-ui
// AND @workspec/c4-ui as module-federation remotes. It declares the SAME
// shared singletons each remote declares (react / react-dom /
// react/jsx-runtime, plus @tanstack/react-query for decision-ui) — the host
// owns one copy of each and the remotes borrow them, so there is exactly one
// React across every boundary. That is what lets each remote's hooks run and
// (for decision-ui) the provider's QueryClient reach the views' `useQuery`.
//
// Each remote entry is a root-relative URL: the smoke server (serve.ts)
// serves the decision-ui remote under `/remote/` and the c4-ui remote under
// `/remote-c4/`, both on the same origin, so no port is baked into this
// build. Remote type consumption is disabled (`dts: false`) — neither remote
// is running at build time; types come from the hand-written
// `src/remotes.d.ts`.

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
        c4Ui: {
          type: 'module',
          name: 'c4Ui',
          entry: '/remote-c4/remoteEntry.js',
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
