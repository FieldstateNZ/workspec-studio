// The standalone client entry. Wires the browser HttpRepository into the host
// contract and mounts the core DecisionApp inside DecisionStudioProvider.
// This local repository host permits direct Decision record edits. Theme + selected decision are the
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
const THEME_STORAGE_KEY = 'workspec.decision-studio.theme';

const host: DecisionStudioHost = {
  repository,
  links: createInertLinkResolver(),
  capabilities: { editDecision: true },
};

function storedTheme(): ThemeName {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'dark';
  } catch {
    return 'dark';
  }
}

function App(): ReactElement {
  const [theme, setTheme] = useState<ThemeName>(storedTheme);
  const [ref, setRef] = useState<string | undefined>(undefined);

  const toggleTheme = (): void => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // A storage-denied browser still gets an in-memory theme toggle.
      }
      return next;
    });
  };

  return (
    <DecisionStudioProvider host={host} theme={theme}>
      <Shell theme={theme} onToggleTheme={toggleTheme} selectedRef={ref} onSelectRef={setRef}>
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
