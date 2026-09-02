import { lazy, StrictMode, Suspense } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { initTheme } from '@workspec/design';

import { SiteNav } from './nav.js';
import { Link, useRoute } from './router.js';
import './styles.css';

// Keep both workbench package families out of the homepage shell until their
// public route is selected.
const StudioHome = lazy(() =>
  import('./studio-home.js').then((module) => ({ default: module.StudioHome })),
);
const CostDemo = lazy(() =>
  import('./cost-demo.js').then((module) => ({ default: module.CostDemo })),
);
const ArchitectureDemo = lazy(() =>
  import('./c4-demo.js').then((module) => ({ default: module.C4Demo })),
);
const StudioApp = lazy(() =>
  import('./studio-app.js').then((module) => ({ default: module.StudioApp })),
);

const REPO_URL = 'https://github.com/FieldstateNZ/workspec-studio/tree/main/packages';

function NotFound(): ReactElement {
  return (
    <>
      <SiteNav repoUrl={REPO_URL} moduleName="studio" moduleHref="/" ariaLabel="WorkSpec Studio" />
      <main className="not-found">
        <p className="eyebrow">404 · module unavailable</p>
        <h1>This Studio page is not currently published.</h1>
        <p>Cost and Architecture are the active public workbenches.</p>
        <Link className="button" href="/">
          Return to Studio home
        </Link>
      </main>
    </>
  );
}

// index.html's inline script set the initial theme signals before first
// paint (stored preference, else OS); this keeps them in sync afterward —
// applying the stored preference if one exists, else following OS changes
// live — through @workspec/design's single setTheme()/initTheme() (Site
// Review UX pass, finding 03/04/05), not this app's own matchMedia listener.
initTheme();

function App(): ReactElement {
  const route = useRoute();
  switch (route) {
    case 'home':
      return (
        <Suspense fallback={<div className="route-loading">Loading WorkSpec Studio…</div>}>
          <StudioHome />
        </Suspense>
      );
    case 'studio':
      return (
        <Suspense fallback={<div className="route-loading">Opening WorkSpec Studio…</div>}>
          <StudioApp />
        </Suspense>
      );
    case 'cost-demo':
      return (
        <Suspense fallback={<div className="route-loading">Loading Cost Attribution…</div>}>
          <CostDemo />
        </Suspense>
      );
    case 'architecture-demo':
      return (
        <Suspense fallback={<div className="route-loading">Loading Architecture Studio…</div>}>
          <ArchitectureDemo />
        </Suspense>
      );
    case 'not-found':
      return <NotFound />;
  }
}

const container = document.getElementById('root');
if (container === null) throw new Error('#root not found');
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
