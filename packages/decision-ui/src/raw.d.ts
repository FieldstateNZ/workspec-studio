// Vite `?raw` imports: file contents as a string. Used by tests to load the
// real example artifacts without touching the filesystem.
declare module '*?raw' {
  const content: string;
  export default content;
}
