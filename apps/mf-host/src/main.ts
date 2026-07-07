// Async boundary. Dynamically importing `bootstrap` defers evaluation of the
// remote modules until module federation's shared scope (react, react-dom,
// react/jsx-runtime, @tanstack/react-query) has initialised — the standard MF
// bootstrap pattern. Rendering happens inside `bootstrap`.
import('./bootstrap').catch((error: unknown) => {
  const root = document.getElementById('root');
  if (root !== null) root.textContent = `Failed to bootstrap the MF host: ${String(error)}`;
  console.error('[mf-host] bootstrap failed', error);
});
