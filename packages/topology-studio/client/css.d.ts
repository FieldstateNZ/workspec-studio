// Side-effect CSS imports (`@workspec/topology-ui/styles.css`, `./shell.css`).
// Vite handles these at build time; this just satisfies `tsc`'s module
// resolution under `moduleResolution: NodeNext`. Mirrors
// `@workspec/cost-studio`'s `client/css.d.ts` exactly.
declare module '*.css';
