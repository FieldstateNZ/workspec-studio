// Side-effect CSS imports (`@workspec/cost-ui/styles.css`, `./shell.css`).
// Vite handles these at build time; this just satisfies `tsc`'s module
// resolution under `moduleResolution: NodeNext` — mirrors
// `@workspec/c4-studio/client/css.d.ts` exactly (both packages are on the
// same TypeScript pin, which added stricter side-effect-import resolution
// checking; `@workspec/decision-studio` predates that pin and doesn't need
// this file).
declare module '*.css';
