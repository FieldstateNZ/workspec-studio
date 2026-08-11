// The standalone client entry: stylesheets + the DOM mount, nothing else.
// The page itself is `App` (app.tsx) — split out so the client suite can
// render it without a `#root` element or a bundler-resolved CSS import.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@workspec/c4-ui/styles.css';
import './shell.css';
import { App } from './app.js';

const container = document.getElementById('root');
if (container === null) throw new Error('#root not found');
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
