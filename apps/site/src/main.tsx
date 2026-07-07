import { StrictMode } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';

import { C4Stub } from './c4-stub.js';
import { Decisions } from './decisions.js';
import { Demo } from './demo.js';
import { useRoute } from './router.js';
import { StudioHome } from './studio-home.js';
import './styles.css';

// index.html's inline script set the initial theme signals before first paint;
// this keeps all three (data-aesthetic, data-theme, .dark) in sync when the OS
// preference changes while the page is open. Always write both dark-mode
// signals together — see @workspec/design docs/theming.md on the dual-signal
// contract and the desync bug (D22) that setting only one invites.
if (typeof window.matchMedia === 'function') {
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  query.addEventListener('change', (event) => {
    const root = document.documentElement;
    root.setAttribute('data-aesthetic', 'console');
    root.setAttribute('data-theme', event.matches ? 'dark' : 'light');
    root.classList.toggle('dark', event.matches);
  });
}

function App(): ReactElement {
  const route = useRoute();
  switch (route) {
    case 'decisions':
      return <Decisions />;
    case 'decisions-demo':
      return <Demo />;
    case 'c4':
      return <C4Stub />;
    case 'studio-home':
      return <StudioHome />;
  }
}

const container = document.getElementById('root');
if (container === null) throw new Error('#root not found');
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
