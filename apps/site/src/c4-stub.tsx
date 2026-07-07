// The C4 Diagrams "coming soon" stub (`/c4`). One page, existing components
// only — no product UI exists yet, so this states what the module will do and
// links the packages it's built from. Swap this out for the real module page
// once `packages/c4-*` ships a UI to embed, the same way `/decisions` embeds
// `@workspec/decision-ui` today.
import type { ReactElement } from 'react';
import { Lbl } from '@workspec/design/components';

import { Link } from './router.js';

const REPO_URL = 'https://github.com/FieldstateNZ/workspec-studio/tree/main/packages';

interface C4Package {
  readonly name: string;
  readonly source: string;
  readonly blurb: string;
}

// Source links only — none of the c4 packages are published to npm yet, so an
// npm href would 404. Point at the registry once they publish.
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
];

export function C4Stub(): ReactElement {
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
          <Lbl>In progress · git-native</Lbl>
          <h1>Browse, validate, and render C4 architecture trees from your repo.</h1>
          <p className="lede">
            The C4 module reads the actors, systems, containers, components, and diagrams already
            described as YAML under your repo’s <code>.workspec/</code> directory, resolves them
            into one architecture model, and lays diagrams out deterministically — the same artifact
            family WorkSpec Enterprise renders today, as a free standalone workbench.
          </p>
        </section>

        <section className="feature">
          <h2>Not live yet</h2>
          <p>
            This page is a placeholder for the module UI — there’s nothing to click through here
            yet. The underlying packages are built and tested in this monorepo; the in-browser
            workbench (the <code>/decisions</code> module’s equivalent of{' '}
            <Link href="/decisions/demo">its live demo</Link>) is the next milestone.
          </p>
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
