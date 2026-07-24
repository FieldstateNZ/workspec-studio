// The standalone client entry. Wires the browser `HttpFileSource` into the
// `TopologyStudioHost` contract and mounts the `Shell` (topbar chrome) +
// `TopologyWorkbench` inside `TopologyStudioProvider`. `capabilities:
// { editLayout: false }` — this authored-only slice never writes back (see
// `http-file-source.ts`'s `writeFile`).
//
// Theme is owned HERE via `@workspec/design`'s persistence contract
// (`resolveInitialTheme`/`setTheme`, one storage key shared by every
// WorkSpec host) — mirrors `@workspec/cost-studio`'s `main.tsx` exactly.

import { StrictMode, useState } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { resolveInitialTheme, setTheme as persistTheme } from '@workspec/design';
import { createInertLinkResolver, TopologyStudioProvider } from '@workspec/topology-ui';
import type { ThemeName, TopologyStudioHost } from '@workspec/topology-ui';
import '@workspec/topology-ui/styles.css';
import './shell.css';
import { HttpFileSource } from './http-file-source.js';
import { Shell } from './shell.js';

const source = new HttpFileSource();

const host: TopologyStudioHost = {
  source,
  links: createInertLinkResolver(),
  capabilities: { editLayout: false },
};

function App(): ReactElement {
  const [theme, setThemeState] = useState<ThemeName>(() => resolveInitialTheme());

  function selectTheme(next: ThemeName): void {
    persistTheme(next);
    setThemeState(next);
  }

  return (
    <TopologyStudioProvider host={host} theme={theme} className="tsh-shell">
      <Shell theme={theme} onSelectTheme={selectTheme} />
    </TopologyStudioProvider>
  );
}

const container = document.getElementById('root');
if (container === null) throw new Error('#root not found');
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
