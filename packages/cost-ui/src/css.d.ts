// Side-effect CSS imports (the `mf/*` module-federation entries pull in
// `../index.css` directly). Vite/tsup handle these at build time; this just
// satisfies `tsc`'s module resolution under `moduleResolution: NodeNext`.
declare module '*.css';
