// The standalone dev story's entry (T5 brief: a small standalone entry so
// all four views — Requirements, Matrix, Feature detail, and Run review
// (T7, #75) — can be screenshotted in a browser for design review).
// `pnpm --filter @workspec/trace-ui dev` serves this at http://localhost:5183/.
//
// Wires a seeded `TraceModel` into `createMemoryRepository`, and mounts
// `TraceApp` inside `TraceStudioProvider`. The model is `buildDevModel()`
// (`./dev-model.ts`) — the package's own `test-helpers/trace-fixture.ts`
// tree plus one extra `skip`-verdict scenario, so the Run review tab has an
// interesting latest run (failures + skips + unproven together) to show;
// see `dev-model.ts`'s doc comment for why that extra scenario lives here
// rather than in the shared fixture. Theme is owned here (a Dark/Light
// toggle), exactly like `@workspec/cost-studio`'s standalone shell
// (`packages/cost-studio/client/main.tsx`) — `TraceStudioProvider` itself
// never calls `matchMedia` or touches storage.
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
import { buildDevModel } from './dev-model.js';
import '../src/index.css';
import './shell.css';

const repository = createMemoryRepository({ model: buildDevModel() });

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
        <span className="tsh-crumb">seeded fixture model — see dev/dev-model.ts</span>
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
