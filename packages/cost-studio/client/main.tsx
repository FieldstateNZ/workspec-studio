// The standalone client entry. Wires the browser HttpRepository into the
// host contract and mounts the Shell (topbar chrome) + CostApp inside
// CostStudioProvider. `capabilities: { editAttribution: true }` turns on
// rule-rail reorder/promotion/removal (see `AttributionWorkbench`).
//
// Theme is owned HERE, not read by any component below the provider (see
// `CostStudioProvider`'s own doc comment: it never calls `matchMedia` or
// touches storage itself). `@workspec/design` DOES export a theme
// persistence contract (`resolveInitialTheme`/`setTheme`, one storage key
// shared by every WorkSpec host) — this shell uses it for the initial value
// and on toggle, rather than plain `useState`, so a reload keeps the last
// choice and this host agrees with any other WorkSpec surface open in the
// same browser. It deliberately does NOT call `initTheme()` (which also
// live-follows OS `prefers-color-scheme` until a preference is stored) —
// that would make `theme` go stale without a `workspec:theme-change`
// listener, which is more machinery than this shell needs; the resolved
// value is read once at startup and only changes via an explicit click on
// the Dark/Light toggle.
import { StrictMode, useState } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient } from '@tanstack/react-query';
import { resolveInitialTheme, setTheme as persistTheme } from '@workspec/design';
import { CostStudioProvider, createInertLinkResolver } from '@workspec/cost-ui';
import type { CostStudioHost, ThemeName } from '@workspec/cost-ui';
import '@workspec/cost-ui/styles.css';
import './shell.css';
import { HttpRepository } from './http-repository.js';
import { Shell } from './shell.js';

const repository = new HttpRepository();
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: false, staleTime: 5_000 },
  },
});

const host: CostStudioHost = {
  repository,
  links: createInertLinkResolver(),
  capabilities: { editAttribution: true },
};

function App(): ReactElement {
  const [theme, setThemeState] = useState<ThemeName>(() => resolveInitialTheme());

  function selectTheme(next: ThemeName): void {
    persistTheme(next);
    setThemeState(next);
  }

  return (
    <CostStudioProvider host={host} queryClient={queryClient} theme={theme} className="csh-shell">
      <Shell theme={theme} onSelectTheme={selectTheme} />
    </CostStudioProvider>
  );
}

const container = document.getElementById('root');
if (container === null) throw new Error('#root not found');
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
