// The Studio-level landing page (`/`). One product, one site: WorkSpec Studio
// modules as paths. Composed entirely from the existing marketing chrome
// (`.site` / `.nav` / `.hero` / `.feature` styles) — no new visual language,
// just a family pitch and cards routing into each module. Copy tracks the
// repository README and the Decisions module's own positioning so none of the
// three ever drift apart.
import type { ReactElement } from 'react';
import { Button, Lbl } from '@workspec/design/components';

import { Link } from './router.js';

const REPO_URL = 'https://github.com/FieldstateNZ/workspec-studio';

interface Module {
  readonly key: string;
  readonly name: string;
  readonly status: 'live' | 'in progress';
  readonly href: string;
  readonly blurb: string;
  readonly cta: string;
}

const MODULES: readonly Module[] = [
  {
    key: 'decisions',
    name: 'Decisions',
    status: 'live',
    href: '/decisions',
    blurb:
      'Cost architecture decisions across dev / test / prod, weigh them on the criteria that matter, and record the outcome as an ADR — all as reviewable *.decision.yaml files that version with git.',
    cta: 'Open Decisions',
  },
  {
    key: 'c4',
    name: 'C4 Diagrams',
    status: 'in progress',
    href: '/c4',
    blurb:
      'Browse, validate, and render C4 architecture trees — actors, systems, containers, components — straight from the .workspec/ files already in your repo.',
    cta: 'Try the demo',
  },
];

export function StudioHome(): ReactElement {
  return (
    <div className="site">
      <header className="nav">
        <span className="brand">
          WorkSpec <strong>Studio</strong>
        </span>
        <nav className="nav-links">
          <Link href="/decisions">Decisions</Link>
          <Link href="/c4">C4 Diagrams</Link>
          <a href={REPO_URL}>GitHub</a>
        </nav>
      </header>

      <main>
        <section className="hero">
          <Lbl>Free · standalone · git-native</Lbl>
          <h1>One workbench over the WorkSpec artifacts already living in your repo.</h1>
          <p className="lede">
            WorkSpec Studio is the open-source home for every free WorkSpec module — costed
            decisions, C4 architecture diagrams, and whatever ships next. Every module reads and
            writes plain YAML artifacts that version with git: no database, no lock-in. WorkSpec
            Enterprise consumes the exact same packages published from here, so nothing here is a
            second-class trial of a paid product.
          </p>
        </section>

        <section className="modules" aria-label="WorkSpec Studio modules">
          {MODULES.map((mod) => (
            <article key={mod.key} className="feature module-card">
              <Lbl className="module-status">{mod.status}</Lbl>
              <h2>{mod.name}</h2>
              <p>{mod.blurb}</p>
              <Button asChild>
                <Link href={mod.href}>{mod.cta}</Link>
              </Button>
            </article>
          ))}
        </section>

        <section className="feature">
          <h2>Open core</h2>
          <p>
            Every package in this monorepo is Enterprise-grade by constitution — WorkSpec Enterprise
            is a future consumer of this code, not a separate implementation. The artifact schemas
            are shared, so files you author here come alive with richer context inside Enterprise’s
            graph, with no forks and one source of truth.
          </p>
        </section>
      </main>

      <footer className="foot">
        <span>Apache-2.0 © 2026 Fieldstate</span>
        <span className="foot-links">
          <a href={REPO_URL}>GitHub</a>
          <a href="https://schema.workspec.io/">Schema registry</a>
        </span>
      </footer>
    </div>
  );
}
