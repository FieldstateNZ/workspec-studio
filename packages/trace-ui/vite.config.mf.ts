import { federation } from '@module-federation/vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The SECOND build target of @workspec/trace-ui: a module-federation REMOTE,
// produced from the exact same `src/` as the tsup library build — no
// component forks. `build` (tsup) stays the standalone library; `build:mf`
// (this config) emits `remoteEntry.js` + the exposed chunks into `dist-mf/`.
// Mirrors packages/cost-ui/vite.config.mf.ts, packages/decision-ui/vite.config.mf.ts,
// and packages/c4-ui/vite.config.mf.ts.
//
// What crosses the federation boundary:
//   • react / react-dom / react/jsx-runtime / @tanstack/react-query are SHARED
//     SINGLETONS — the host owns one copy each; the remote borrows them. This
//     is what keeps hooks working (one React) and the provider's QueryClient
//     wired to `useTraceModel` (one react-query).
//   • @workspec/trace-model, @workspec/req-schema, and @workspec/design (tokens
//     + the one adopted component, Tabs) are BUNDLED IN. They are not framework
//     singletons; a self-contained remote is the goal, so they ship inside it.
//     The remote also compiles its OWN Tailwind CSS (the @tailwindcss/vite
//     plugin over src/index.css, theme + utilities layers only, no preflight)
//     — the host needs no Tailwind build and its page styles are never reset.

import pkg from './package.json' with { type: 'json' };

const REACT_RANGE = '^18.3';
const RQ_RANGE = pkg.peerDependencies['@tanstack/react-query'];

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    federation({
      name: 'traceStudio',
      filename: 'remoteEntry.js',
      exposes: {
        './MetersBar': './src/mf/MetersBar.tsx',
        './RequirementsExplorer': './src/mf/RequirementsExplorer.tsx',
        './MatrixView': './src/mf/MatrixView.tsx',
        './FeatureDetail': './src/mf/FeatureDetail.tsx',
        './TraceApp': './src/mf/TraceApp.tsx',
        // Auxiliary modules a host needs to mount the above:
        './provider': './src/mf/provider.ts', // TraceStudioProvider + host helpers
        './reactProbe': './src/mf/reactProbe.ts', // single-React-instance canary
      },
      shared: {
        react: { singleton: true, requiredVersion: REACT_RANGE },
        'react-dom': { singleton: true, requiredVersion: REACT_RANGE },
        'react/jsx-runtime': { singleton: true, requiredVersion: REACT_RANGE },
        '@tanstack/react-query': { singleton: true, requiredVersion: RQ_RANGE },
      },
      // Attach the bundle's CSS to every exposed module so loading any
      // federated view injects the compiled styles automatically.
      bundleAllCSS: true,
      // Resolve exposed chunks relative to wherever `remoteEntry.js` is
      // served at runtime (not a baked base path), so the remote can be
      // hosted anywhere.
      publicPath: 'auto',
    }),
  ],
  build: {
    outDir: 'dist-mf',
    // Module federation's runtime uses top-level await; target a runtime
    // that supports it and skip minification so the emitted remote stays
    // legible.
    target: 'esnext',
    minify: false,
    // A remote has no index.html; give Vite a nominal (empty) input so it
    // builds headless. The plugin emits `remoteEntry.js` + the exposed
    // chunks itself.
    rollupOptions: {
      input: './src/mf/remote-entry.ts',
    },
  },
});
