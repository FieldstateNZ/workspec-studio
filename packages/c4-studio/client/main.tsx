// The standalone client entry. Fetches the whole model once from the host's
// `GET /api/model`, then mounts `<C4Explorer>` with a browser-side
// `C4FileSource` (`HttpSource`) as `host.source` and `capabilities: {
// editLayout: true }` — so drag-to-pin is live: dragging a node writes the
// diagram's `.layout/` file back through `PUT /api/file`.
import { StrictMode, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { C4Model } from '@workspec/c4-model';
import { C4Explorer, createInertLinkResolver } from '@workspec/c4-ui';
import type { C4StudioHost, ThemeName } from '@workspec/c4-ui';
import '@workspec/c4-ui/styles.css';
import './shell.css';
import { fetchModel } from './fetch-model.js';
import { createHttpSource } from './http-source.js';
import { Shell } from './shell.js';

const source = createHttpSource();
const host: C4StudioHost = {
  source,
  linkResolver: createInertLinkResolver(),
  capabilities: { editLayout: true },
};

function App(): ReactElement {
  const [theme, setTheme] = useState<ThemeName>('dark');
  const [model, setModel] = useState<C4Model | null>(null);
  const [dir, setDir] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchModel()
      .then(setModel)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
    fetch('/api/health')
      .then((res) => res.json())
      .then((body: { dir?: string }) => setDir(body.dir ?? ''))
      .catch(() => undefined);
  }, []);

  return (
    <Shell
      theme={theme}
      onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      dir={dir}
    >
      {error !== null ? (
        <div className="c4sh-error" role="alert">
          Could not reach the host API: {error}
        </div>
      ) : model === null ? (
        <div className="c4sh-empty">Loading the working tree…</div>
      ) : model.diagrams.length === 0 ? (
        <div className="c4sh-empty">
          No diagrams found under <code>.workspec/diagrams/</code>. Author one and reload.
        </div>
      ) : (
        <C4Explorer model={model} host={host} theme={theme} />
      )}
    </Shell>
  );
}

const container = document.getElementById('root');
if (container === null) throw new Error('#root not found');
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
