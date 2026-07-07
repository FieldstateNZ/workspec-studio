// The in-browser demo. Mounts the real DecisionApp (Options / Compare / Catalog
// / ADR) from the PUBLISHED @workspec/decision-ui against a MemoryRepository
// seeded with both worked examples. Everything — lever toggles, cost edits,
// compare, the decide flow — runs in memory; nothing leaves the browser.
import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import {
  DecisionApp,
  DecisionStudioProvider,
  createInertLinkResolver,
} from '@workspec/decision-ui';
import type { DecisionStudioHost, ThemeName } from '@workspec/decision-ui';
import '@workspec/decision-ui/styles.css';

import { DEMO_EXAMPLES, createDemoRepository } from './seed.js';
import { downloadText, renderAdr } from './export-adr.js';
import { Link } from './router.js';

const COLOR_SCHEME_QUERY = '(prefers-color-scheme: dark)';

// Follow the OS colour scheme so the embedded studio matches the rest of the
// page (which is theme-aware via `prefers-color-scheme`). Falls back to dark
// where `matchMedia` is unavailable (e.g. jsdom).
function useSystemTheme(): ThemeName {
  const supported = typeof window !== 'undefined' && typeof window.matchMedia === 'function';
  const [dark, setDark] = useState<boolean>(() =>
    supported ? window.matchMedia(COLOR_SCHEME_QUERY).matches : true,
  );
  useEffect(() => {
    if (!supported) return;
    const mql = window.matchMedia(COLOR_SCHEME_QUERY);
    const onChange = (event: MediaQueryListEvent): void => setDark(event.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [supported]);
  return dark ? 'dark' : 'light';
}

export function Demo(): ReactElement {
  const [exampleKey, setExampleKey] = useState<string>(DEMO_EXAMPLES[0]?.key ?? 'hosting');
  // Bumping this token discards every in-browser edit by rebuilding the repo.
  const [resetToken, setResetToken] = useState(0);
  const theme = useSystemTheme();

  const repository = useMemo(() => createDemoRepository(), [resetToken]);
  const host: DecisionStudioHost = useMemo(
    () => ({
      repository,
      links: createInertLinkResolver(),
      // A full in-memory sandbox: editing and deciding are both on.
      capabilities: { editCatalog: true, decide: true },
    }),
    [repository],
  );

  const active = DEMO_EXAMPLES.find((example) => example.key === exampleKey) ?? DEMO_EXAMPLES[0];
  if (active === undefined) throw new Error('demo: no examples seeded');

  async function onExportAdr(): Promise<void> {
    const { filename, markdown } = await renderAdr(repository, active!.decisionRef);
    downloadText(filename, markdown);
  }

  return (
    <div className="demo">
      <header className="demo-bar">
        <Link href="/" className="demo-home" aria-label="Back to the WorkSpec Decision Studio home">
          ← WorkSpec Decision Studio
        </Link>
        {/* A toggle button group, not an ARIA tablist — these switch the seeded
            example, they don't reveal tabpanels. */}
        <div className="demo-examples" role="group" aria-label="Worked examples">
          {DEMO_EXAMPLES.map((example) => (
            <button
              key={example.key}
              type="button"
              aria-pressed={example.key === active.key}
              className={example.key === active.key ? 'demo-tab is-active' : 'demo-tab'}
              onClick={() => setExampleKey(example.key)}
            >
              {example.label}
            </button>
          ))}
        </div>
        <div className="demo-actions">
          <button type="button" className="demo-btn" onClick={() => void onExportAdr()}>
            Export ADR
          </button>
          <button
            type="button"
            className="demo-btn demo-btn-ghost"
            onClick={() => setResetToken((n) => n + 1)}
          >
            Reset
          </button>
        </div>
      </header>

      <p className="demo-note" role="note">
        Changes live only in your browser — the real thing writes <code>*.decision.yaml</code> files
        in your repo. <span className="demo-blurb">{active.blurb}</span>
      </p>

      <DecisionStudioProvider host={host} theme={theme}>
        <main className="demo-stage" key={`${resetToken}:${active.key}`}>
          <DecisionApp decisionRef={active.decisionRef} />
        </main>
      </DecisionStudioProvider>
    </div>
  );
}
