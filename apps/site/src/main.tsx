import { lazy, StrictMode, Suspense } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';

import { Decisions } from './decisions.js';
import { Demo } from './demo.js';
import { useRoute } from './router.js';
import { StudioHome } from './studio-home.js';
import './styles.css';

// The /c4 page pulls in the whole c4 stack — @workspec/c4-ui, c4-model, and
// (heaviest of all) c4-layout's bundled elkjs. Lazy-loading it keeps those
// out of the main chunk, so `/`, `/decisions`, and `/decisions/demo` never
// pay for elkjs.
const C4 = lazy(() => import('./c4.js').then((module) => ({ default: module.C4 })));

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
      return (
        <Suspense fallback={<div className="route-loading">Loading C4 Diagrams…</div>}>
          <C4 />
        </Suspense>
      );
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
