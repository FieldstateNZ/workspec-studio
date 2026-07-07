import { federation } from '@module-federation/vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The SECOND build target of @workspec/c4-ui: a module-federation REMOTE,
// produced from the exact same `src/` as the tsup library build — no
// component forks. `build` (tsup) stays the standalone library; `build:mf`
// (this config) emits `remoteEntry.js` + the exposed chunks into `dist-mf/`.
// Mirrors packages/decision-ui/vite.config.mf.ts.
//
// What crosses the federation boundary:
//   • react / react-dom / react/jsx-runtime are SHARED SINGLETONS — the host
//     owns one copy each; the remote borrows them. This is what keeps hooks
//     working (one React) across the boundary.
//   • @workspec/c4-schema, @workspec/c4-model, @workspec/c4-layout, and
//     @workspec/design are BUNDLED IN — a self-contained remote is the goal.
//     The remote also compiles its OWN Tailwind CSS (the @tailwindcss/vite
//     plugin over src/index.css, theme + utilities layers only, no
//     preflight) — the host needs no Tailwind build and its page styles are
//     never reset.
import pkg from './package.json' with { type: 'json' };

const REACT_RANGE = pkg.peerDependencies.react;

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    federation({
      name: 'c4Ui',
      filename: 'remoteEntry.js',
      exposes: {
        './C4Diagram': './src/mf/C4Diagram.tsx',
        './C4Explorer': './src/mf/C4Explorer.tsx',
        './reactProbe': './src/mf/reactProbe.ts', // single-React-instance canary
      },
      shared: {
        react: { singleton: true, requiredVersion: REACT_RANGE },
        'react-dom': { singleton: true, requiredVersion: REACT_RANGE },
        'react/jsx-runtime': { singleton: true, requiredVersion: REACT_RANGE },
      },
      // Attach the bundle's CSS to every exposed module so loading any
      // federated view injects the compiled styles — the host needs no
      // separate CSS wiring.
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
