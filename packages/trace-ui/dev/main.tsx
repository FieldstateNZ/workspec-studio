// The standalone dev story's entry (T5 brief: a small standalone entry so
// the Requirements + Feature detail views can be screenshotted in a browser
// for design review). `pnpm --filter @workspec/trace-ui dev` serves this at
// http://localhost:5183/.
//
// Wires a seeded fixture `TraceModel` (the same one this package's own
// render tests use — see `../src/test-helpers/trace-fixture.ts`) into
// `createMemoryRepository`, and mounts `TraceApp` inside
// `TraceStudioProvider`. Theme is owned here (a Dark/Light toggle), exactly
// like `@workspec/cost-studio`'s standalone shell (`packages/cost-studio/client/main.tsx`)
// — `TraceStudioProvider` itself never calls `matchMedia` or touches storage.
import { StrictMode, useState } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { resolveInitialTheme, setTheme as persistTheme } from '@workspec/design';
import {
  TraceApp,
  TraceStudioProvider,
  createInertLinkResolver,
  createMemoryRepository,
} from '../src/index.js';
import type { ThemeName, TraceStudioHost } from '../src/index.js';
import { buildFixtureModel } from '../src/test-helpers/trace-fixture.js';
import '../src/index.css';
import './shell.css';

const repository = createMemoryRepository({ model: buildFixtureModel() });

const host: TraceStudioHost = {
  repository,
  links: createInertLinkResolver(),
  capabilities: { generateSkeletons: false },
};

const THEME_OPTIONS: ThemeName[] = ['dark', 'light'];

function App(): ReactElement {
  const [theme, setThemeState] = useState<ThemeName>(() => resolveInitialTheme());

  function selectTheme(next: ThemeName): void {
    persistTheme(next);
    setThemeState(next);
  }

  return (
    <TraceStudioProvider host={host} theme={theme} className="tsh-shell">
      <header className="tsh-topbar">
        <span className="tsh-brand">trace-ui dev story</span>
        <span className="tsh-crumb">seeded fixture model — see test-helpers/trace-fixture.ts</span>
        <span className="tsh-spacer" />
        <div className="tsh-toggle" role="group" aria-label="Theme">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              className={`tsh-toggle-seg${theme === option ? ' tsh-toggle-seg--active' : ''}`}
              aria-pressed={theme === option}
              onClick={() => selectTheme(option)}
            >
              {option === 'dark' ? 'Dark' : 'Light'}
            </button>
          ))}
        </div>
      </header>
      <main className="tsh-main">
        <TraceApp />
      </main>
    </TraceStudioProvider>
  );
}

const container = document.getElementById('root');
if (container === null) throw new Error('#root not found');
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
