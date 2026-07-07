// Vite `?raw` imports: file contents as a string. Used by tests to load the
// real example artifacts without touching the filesystem.
declare module '*?raw' {
  const content: string;
  export default content;
}

// Side-effect CSS imports (the `mf/*` module-federation entries pull in
// `../styles.css` directly). Vite/tsup handle these at build time; this just
// satisfies `tsc`'s module resolution under `moduleResolution: NodeNext`.
declare module '*.css';
