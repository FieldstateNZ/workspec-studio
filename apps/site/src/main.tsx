import { lazy, StrictMode, Suspense } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { initTheme } from '@workspec/design';

import { Decisions } from './decisions.js';
import { Demo } from './demo.js';
import { useRoute } from './router.js';
import { StudioHome } from './studio-home.js';
import './styles.css';

// The /c4 pages pull in the whole c4 stack — @workspec/c4-ui, c4-model, and
// (heaviest of all) c4-layout's bundled elkjs. Lazy-loading them keeps those
// out of the main chunk, so `/`, `/decisions`, and `/decisions/demo` never
// pay for elkjs.
const C4 = lazy(() => import('./c4.js').then((module) => ({ default: module.C4 })));
const C4Demo = lazy(() => import('./c4-demo.js').then((module) => ({ default: module.C4Demo })));

// index.html's inline script set the initial theme signals before first
// paint (stored preference, else OS); this keeps them in sync afterward —
// applying the stored preference if one exists, else following OS changes
// live — through @workspec/design's single setTheme()/initTheme() (Site
// Review UX pass, finding 03/04/05), not this app's own matchMedia listener.
initTheme();

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
    case 'c4-demo':
      return (
        <Suspense fallback={<div className="route-loading">Loading C4 Diagrams…</div>}>
          <C4Demo />
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
