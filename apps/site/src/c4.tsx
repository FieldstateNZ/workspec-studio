// The C4 Diagrams module page (`/c4`): pitch copy (same design language as
// `/decisions`) plus a live in-browser demo — `C4Explorer` over a
// `MemorySource` seeded with the representative example tree (see
// `c4-seed.ts`). Read-only: `capabilities: { editLayout: false }`, no
// `source` — this is a showcase, not an editor.
//
// Dependency note: the four `@workspec/c4-*` packages (plus `@workspec/design`
// via `c4-ui`) are `workspace:*` **devDependencies** here — a deliberate,
// temporary exception to this app's registry-pins-only rule (see
// `package.json`'s devDependencies block and `docs/c4/drift-log.md` entry 17).
// They are not yet published to npm; the decisions demo's registry pins are
// untouched.
import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import type { C4Model } from '@workspec/c4-model';
import { C4Explorer, createInertLinkResolver } from '@workspec/c4-ui';
import type { C4StudioHost, ThemeName } from '@workspec/c4-ui';
import '@workspec/c4-ui/styles.css';
import { Lbl } from '@workspec/design/components';

import { loadDemoModel } from './c4-seed.js';
import { Link } from './router.js';

const REPO_URL = 'https://github.com/FieldstateNZ/workspec-studio/tree/main/packages';

interface C4Package {
  readonly name: string;
  readonly source: string;
  readonly blurb: string;
}

const PACKAGES: readonly C4Package[] = [
  {
    name: '@workspec/c4-schema',
    source: `${REPO_URL}/c4-schema`,
    blurb:
      'Zod source of truth for C4 elements, diagrams, and layouts — plus generated JSON Schema.',
  },
  {
    name: '@workspec/c4-model',
    source: `${REPO_URL}/c4-model`,
    blurb:
      'Pure loader/resolver — discovers and resolves a working tree’s .workspec/ files into one typed model.',
  },
  {
    name: '@workspec/c4-layout',
    source: `${REPO_URL}/c4-layout`,
    blurb: 'Deterministic ELK-based auto-layout for resolved C4 diagrams.',
  },
  {
    name: '@workspec/c4-ui',
    source: `${REPO_URL}/c4-ui`,
    blurb: 'Host-agnostic React components — the interactive canvas and the deterministic SVG export.',
  },
  {
    name: '@workspec/c4-studio',
    source: `${REPO_URL}/c4-studio`,
    blurb: 'The CLI (workspec-c4: validate, render, serve) and localhost host shell.',
  },
];

const COLOR_SCHEME_QUERY = '(prefers-color-scheme: dark)';

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

const host: C4StudioHost = {
  linkResolver: createInertLinkResolver(),
  // Read-only showcase: no `source`, so drag-to-pin never activates even if a
  // future edit accidentally flipped this to `true`.
  capabilities: { editLayout: false },
};

export function C4(): ReactElement {
  const theme = useSystemTheme();
  const [model, setModel] = useState<C4Model | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadDemoModel().then(
      (loaded) => {
        if (!cancelled) setModel(loaded);
      },
      (err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const diagramCount = useMemo(() => model?.diagrams.length ?? 0, [model]);

  return (
    <div className="site">
      <header className="nav">
        <span className="brand">
          <Link href="/">WorkSpec Studio</Link> · <strong>C4 Diagrams</strong>
        </span>
        <nav className="nav-links">
          <Link href="/decisions">Decisions</Link>
          <a href={REPO_URL}>GitHub</a>
        </nav>
      </header>

      <main>
        <section className="hero">
          <Lbl>Free · standalone · git-native</Lbl>
          <h1>Browse, validate, and render C4 architecture trees from your repo.</h1>
          <p className="lede">
            The C4 module reads the actors, systems, containers, components, and diagrams already
            described as YAML under your repo’s <code>.workspec/</code> directory, resolves them
            into one architecture model, and lays diagrams out deterministically — the same
            artifact family WorkSpec Enterprise renders today, as a free standalone workbench.
          </p>
        </section>

        <section className="demo-embed" aria-label="C4 explorer demo">
          <h2>See it move</h2>
          <p className="c4-demo-note" role="note">
            A live <code>C4Explorer</code> running entirely in your browser against a
            representative example tree{diagramCount > 0 ? ` (${diagramCount} diagrams)` : ''} —
            no install, no signup, read-only. <code>npx @workspec/c4-studio serve</code> gives you
            the same explorer with drag-to-pin over your own repo.
          </p>
          {error !== null ? (
            <div className="c4-demo-error" role="alert">
              Could not load the demo tree: {error}
            </div>
          ) : model === null ? (
            <div className="c4-demo-loading">Loading the demo tree…</div>
          ) : (
            <div className="c4-demo-stage">
              {/* The discovery order (alphabetical by filename) puts
                  "container" before "system-context" — pin the more natural
                  entry point explicitly rather than leave the demo's first
                  impression to filename sort order. */}
              <C4Explorer model={model} host={host} theme={theme} initialDiagramSlug="system-context" />
            </div>
          )}
        </section>

        <section className="feature">
          <h2>The packages so far</h2>
          <p className="muted">Source on GitHub, npm publish pending.</p>
          <ul>
            {PACKAGES.map((pkg) => (
              <li key={pkg.name}>
                <a href={pkg.source}>
                  <code>{pkg.name}</code>
                </a>{' '}
                — {pkg.blurb}
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="foot">
        <span>Apache-2.0 © 2026 Fieldstate</span>
        <span className="foot-links">
          <Link href="/">WorkSpec Studio</Link>
          <a href={REPO_URL}>GitHub</a>
        </span>
      </footer>
    </div>
  );
}
