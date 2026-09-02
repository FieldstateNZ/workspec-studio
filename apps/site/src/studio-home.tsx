import type { ReactElement } from 'react';

import { SiteNav } from './nav.js';
import { Link, navigate } from './router.js';
import { setPendingImport } from './pending-import.js';

const REPO_URL = 'https://github.com/FieldstateNZ/workspec-studio';

export function StudioHome(): ReactElement {
  return (
    <div className="home-shell">
      <SiteNav
        repoUrl={REPO_URL}
        moduleName="studio"
        moduleHref="/"
        ariaLabel="WorkSpec Studio"
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
              <h1 className="home-title">From application design to an infrastructure decision.</h1>
              <p className="home-lede">
                Design the system, derive the infrastructure it needs, compare Azure and AWS, and
                record the decision. The complete result stays in portable, reviewable WorkSpec files.
              </p>
              <div className="home-cta-row">
                <Link href="/studio/design" className="home-cta home-cta-primary">
                  Start new <span aria-hidden="true">→</span>
                </Link>
                <label className="home-cta home-cta-outline home-import-cta">
                  Import .workspec ZIP
                  <input
                    type="file"
                    accept=".zip,application/zip"
                    aria-label="Import .workspec ZIP"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      if (file) {
                        setPendingImport(file);
                        navigate('/studio/design');
                      }
                    }}
                  />
                </label>
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
                design&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;C4 architecture · interactive canvas
              </div>
              <div className="home-terminal-line home-terminal-soft">
                plan&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;requirements · Azure / AWS comparison
              </div>
              <div className="home-terminal-line home-terminal-muted">
                data stays in this browser
              </div>
            </div>
          </div>
        </section>

        <section className="home-modules" aria-label="WorkSpec workflow">
          <div className="home-strip-head">
            <span className="home-strip-label">One connected workflow</span>
            <span className="home-strip-rule" aria-hidden="true" />
            <span className="home-strip-note">
              the same files drive every stage
            </span>
          </div>
          <div className="home-journey-grid">
            {[
              ['01', 'Design', 'Build the C4 model on an interactive canvas.'],
              ['02', 'Plan', 'Turn deployable elements into an editable infrastructure shopping list.'],
              ['03', 'Compare', 'Map the same requirements to Azure and AWS with monthly estimates.'],
              ['04', 'Decide', 'Choose an option, generate the ADR, and download the complete workspace.'],
            ].map(([number, title, copy]) => (
              <article className="home-journey-card" key={number}>
                <span>{number}</span><h2>{title}</h2><p>{copy}</p>
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
