// Vite `?raw` imports: file contents as a string. Used to load the hosting-platform fixtures.
declare module '*?raw' {
  const content: string;
  export default content;
}
