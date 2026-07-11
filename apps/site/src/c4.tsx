// The C4 Diagrams module page (`/c4`): pitch copy (same design language as
// `/decisions`), a CTA into the full-page demo at `/c4/demo` (see
// `c4-demo.tsx`), and the packages list. Used to embed the live `C4Explorer`
// directly in a 640px box here — split out (Site Review UX pass, finding
// 06) so C4's demo gets the same full-page shell Decisions' does, instead of
// reading as a "widget" bolted onto a marketing page.
import type { ReactElement } from 'react';
import { Button, Lbl } from '@workspec/design/components';

import { Link } from './router.js';
import { SiteNav } from './nav.js';

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
    blurb:
      'Host-agnostic React components — the interactive canvas and the deterministic SVG export.',
  },
  {
    name: '@workspec/c4-studio',
    source: `${REPO_URL}/c4-studio`,
    blurb: 'The CLI (workspec-c4: validate, render, serve) and localhost host shell.',
  },
];

export function C4(): ReactElement {
  return (
    <>
      <SiteNav
        repoUrl={REPO_URL}
        extras={
          <Link className="nav-extra" href="/c4/demo">
            Live demo
          </Link>
        }
      />
      <div className="site">
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
            <div className="cta-row">
              <Button asChild>
                <Link href="/c4/demo">Try the live demo</Link>
              </Button>
              <Button asChild variant="secondary">
                <a href={REPO_URL}>View on GitHub</a>
              </Button>
            </div>
          </section>

          <section className="closing">
            <h2>See it move</h2>
            <p>
              A live <code>C4Explorer</code> running entirely in your browser against a
              representative example tree — no install, no signup, read-only.{' '}
              <code>npx @workspec/c4-studio serve</code> gives you the same explorer with
              drag-to-pin over your own repo.
            </p>
            <Button asChild>
              <Link href="/c4/demo">Open the live demo</Link>
            </Button>
          </section>

          <section className="feature">
            <h2>The packages so far</h2>
            <p className="muted">Source on GitHub, on npm at 0.1.0-alpha.</p>
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
    </>
  );
}
