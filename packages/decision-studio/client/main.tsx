// The standalone client entry. Wires the browser HttpRepository into the host
// contract and mounts the full four-view DecisionApp inside DecisionStudioProvider.
// S5 turns the capabilities on — `{ editCatalog: true, decide: true }` — so the
// Catalog editor and the decide flow are live. Theme + selected decision are the
// only client-owned state; everything else flows through the port.

import { StrictMode, useState } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import {
  DecisionApp,
  DecisionStudioProvider,
  createInertLinkResolver,
} from '@workspec/decision-ui';
import type { DecisionStudioHost, ThemeName } from '@workspec/decision-ui';
import '@workspec/decision-ui/styles.css';
import './shell.css';
import { HttpRepository } from './http-repository.js';
import { Shell } from './shell.js';

const repository = new HttpRepository();

const host: DecisionStudioHost = {
  repository,
  links: createInertLinkResolver(),
  capabilities: { editCatalog: true, decide: true },
};

function App(): ReactElement {
  const [theme, setTheme] = useState<ThemeName>('dark');
  const [ref, setRef] = useState<string | undefined>(undefined);

  return (
    <DecisionStudioProvider host={host} theme={theme}>
      <Shell
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        selectedRef={ref}
        onSelectRef={setRef}
      >
        {ref !== undefined ? (
          <DecisionApp decisionRef={ref} />
        ) : (
          <div className="dsh-empty">Select a decision to begin.</div>
        )}
      </Shell>
    </DecisionStudioProvider>
  );
}

const container = document.getElementById('root');
if (container === null) throw new Error('#root not found');
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
