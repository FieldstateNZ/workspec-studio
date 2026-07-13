import { federation } from '@module-federation/vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The SECOND build target of @workspec/cost-ui (C6/D5): a module-federation
// REMOTE, produced from the exact same `src/` as the tsup library build — no
// component forks. `build` (tsup) stays the standalone library; `build:mf`
// (this config) emits `remoteEntry.js` + the exposed chunks into `dist-mf/`.
// Mirrors packages/decision-ui/vite.config.mf.ts and packages/c4-ui/vite.config.mf.ts.
//
// What crosses the federation boundary:
//   • react / react-dom / react/jsx-runtime / @tanstack/react-query are SHARED
//     SINGLETONS — the host owns one copy each; the remote borrows them. This is
//     what keeps hooks working (one React) and the provider's QueryClient wired
//     to the views' `useQuery` (one react-query). See the version-range policy
//     below and docs/cost/mf-host-contract.md.
//   • the engine, the schema, zod, and @workspec/design (tokens + the adopted
//     components) are BUNDLED IN. They are not framework singletons; a
//     self-contained remote is the goal, so they ship inside it. The remote
//     also compiles its OWN Tailwind CSS (the @tailwindcss/vite plugin over
//     src/index.css, theme + utilities layers only, no preflight) — the host
//     needs no Tailwind build and its page styles are never reset.
//
// Vite pin: `@module-federation/vite@^1.16` supports Vite 5/6/7/8, so the remote
// builds on the repo's existing Vite 7 — no separate Vite major was needed.

// React singletons follow a fixed range; @tanstack/react-query follows the
// package's own declared peer range (kept in one place, package.json).
import pkg from './package.json' with { type: 'json' };

const REACT_RANGE = '^18.3';
const RQ_RANGE = pkg.peerDependencies['@tanstack/react-query'];

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    federation({
      name: 'costStudio',
      filename: 'remoteEntry.js',
      exposes: {
        './CostInventory': './src/mf/CostInventory.tsx',
        './AttributionWorkbench': './src/mf/AttributionWorkbench.tsx',
        './CostReport': './src/mf/CostReport.tsx',
        './TagPlanView': './src/mf/TagPlanView.tsx',
        // Auxiliary modules a host needs to mount the above:
        './provider': './src/mf/provider.ts', // CostStudioProvider + host helpers
        './reactProbe': './src/mf/reactProbe.ts', // single-React-instance canary
      },
      shared: {
        react: { singleton: true, requiredVersion: REACT_RANGE },
        'react-dom': { singleton: true, requiredVersion: REACT_RANGE },
        'react/jsx-runtime': { singleton: true, requiredVersion: REACT_RANGE },
        '@tanstack/react-query': { singleton: true, requiredVersion: RQ_RANGE },
      },
      // Attach the bundle's CSS to every exposed module so loading any federated
      // view injects the compiled styles (WorkSpec tokens + component
      // utilities) — the host needs no separate CSS wiring.
      bundleAllCSS: true,
      // Resolve exposed chunks relative to wherever `remoteEntry.js` is served at
      // runtime (not a baked base path), so the remote can be hosted anywhere.
      publicPath: 'auto',
    }),
  ],
  build: {
    outDir: 'dist-mf',
    // Module federation's runtime uses top-level await; target a runtime that
    // supports it and skip minification so the emitted remote stays legible.
    target: 'esnext',
    minify: false,
    // A remote has no index.html; give Vite a nominal (empty) input so it builds
    // headless. The plugin emits `remoteEntry.js` + the exposed chunks itself.
    rollupOptions: {
      input: './src/mf/remote-entry.ts',
    },
  },
});
