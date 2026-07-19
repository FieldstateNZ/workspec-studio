// Nominal build entry for the module-federation REMOTE build. A remote has no
// standalone HTML page — everything reachable is reached through
// `remoteEntry.js` and the exposed modules, which the federation plugin emits
// itself. Vite still wants a root input, so this file is it: intentionally
// empty. Mirrors packages/cost-ui/src/mf/remote-entry.ts.
export {};
