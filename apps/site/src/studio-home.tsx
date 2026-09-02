import type { CSSProperties, ReactElement } from 'react';
import { Status } from '@workspec/design/components';

import { SiteNav } from './nav.js';
import { Link } from './router.js';

const REPO_URL = 'https://github.com/FieldstateNZ/workspec-studio';

const STUDIOS = [
  {
    key: 'cost',
    eyebrow: 'studio · cost',
    name: 'Cost Attribution',
    href: '/cost',
    blurb:
      'Turn a cloud stocktake into reviewable attribution rules, tag plans and portable WorkSpec artifacts.',
    cta: 'Open Cost Studio',
    accent: 'var(--type-scenario)',
    eyebrowColor: 'color-mix(in oklab, var(--type-scenario) 70%, var(--ink))',
  },
  {
    key: 'architecture',
    eyebrow: 'studio · architecture',
    name: 'Architecture',
    href: '/architecture',
    blurb:
      'Explore a C4 model as a connected canvas, inspect its elements and shape relationships with an agent.',
    cta: 'Open Architecture Studio',
    accent: 'var(--el-system)',
    eyebrowColor: 'color-mix(in oklab, var(--el-system) 70%, var(--ink))',
  },
] as const;

export function StudioHome(): ReactElement {
  return (
    <div className="home-shell">
      <SiteNav
        repoUrl={REPO_URL}
        moduleName="studio"
        moduleHref="/"
        ariaLabel="WorkSpec Studio"
        extras={
          <>
            <Link className="nav-extra" href="/cost">
              Cost
            </Link>
            <Link className="nav-extra" href="/architecture">
              Architecture
            </Link>
          </>
        }
      />

      <main className="home">
        <section className="home-hero" aria-label="WorkSpec Studio">
          <div className="home-hero-grid">
            <div>
              <div className="home-eyebrow">
                <span className="home-eyebrow-accent">workspec-studio</span>
                <span className="home-eyebrow-sep">/</span>
                <span>agent-ready workbenches</span>
              </div>
              <h1 className="home-title">Make the architecture and cost model discussable.</h1>
              <p className="home-lede">
                Work with portable WorkSpec artifacts in the browser. An agent can load the model,
                collaborate through site tools and leave you with reviewable files — without a
                hosted account or hidden database.
              </p>
              <div className="home-cta-row">
                <Link href="/cost" className="home-cta home-cta-primary">
                  Open Cost Studio <span aria-hidden="true">→</span>
                </Link>
                <Link href="/architecture" className="home-cta home-cta-outline">
                  Open Architecture Studio
                </Link>
              </div>
            </div>

            <div className="home-terminal" role="group" aria-label="Studio connection status">
              <div className="home-terminal-dots" aria-hidden="true">
                <span className="home-terminal-dot" />
                <span className="home-terminal-dot" />
                <span className="home-terminal-dot" />
              </div>
              <div className="home-terminal-line home-terminal-cmd">
                <code>WebMCP connected</code>
              </div>
              <div className="home-terminal-line home-terminal-soft">
                cost&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;6 tools ·
                attribution workflow
              </div>
              <div className="home-terminal-line home-terminal-soft">
                architecture&nbsp;&nbsp;&nbsp;5 tools · C4 workflow
              </div>
              <div className="home-terminal-line home-terminal-muted">
                data stays in this browser
              </div>
            </div>
          </div>
        </section>

        <section className="home-modules" aria-label="WorkSpec studios">
          <div className="home-strip-head">
            <span className="home-strip-label">Studios</span>
            <span className="home-strip-rule" aria-hidden="true" />
            <span className="home-strip-note">
              working surfaces over reviewable .workspec artifacts
            </span>
          </div>
          <div className="home-module-grid">
            {STUDIOS.map((studio) => (
              <article
                key={studio.key}
                className="home-module-card"
                style={
                  {
                    '--module-accent': studio.accent,
                    '--module-eyebrow': studio.eyebrowColor,
                  } as CSSProperties
                }
              >
                <div className="home-module-body">
                  <div className="home-module-head">
                    <span className="home-module-eyebrow">{studio.eyebrow}</span>
                    <Status tone="accent" className="home-module-status">
                      live
                    </Status>
                  </div>
                  <h2 className="home-module-title">{studio.name}</h2>
                  <p className="home-module-blurb">{studio.blurb}</p>
                  <Link href={studio.href} className="home-module-cta">
                    {studio.cta} <span aria-hidden="true">→</span>
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="home-foot">
        <div className="home-foot-inner">
          <span>© 2026 workspec</span>
          <span className="home-foot-sep" aria-hidden="true">
            ·
          </span>
          <span>Apache-2.0</span>
          <span className="home-foot-spacer" />
          <a href="https://schema.workspec.io/">Schema registry</a>
        </div>
      </footer>
    </div>
  );
}
