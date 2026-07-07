// Side-effect CSS imports (`@workspec/c4-ui/styles.css`, `./shell.css`).
// Vite handles these at build time; this just satisfies `tsc`'s module
// resolution under `moduleResolution: NodeNext` — mirrors
// `@workspec/c4-ui/src/css.d.ts` exactly (both packages are on the same
// TypeScript pin, which added stricter side-effect-import resolution
// checking).
declare module '*.css';
