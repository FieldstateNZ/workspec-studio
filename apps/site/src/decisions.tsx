// The Decisions module page (`/decisions`), moved intact from the standalone
// Decision Studio site's former `/` — same positioning copy, same quickstart,
// same demo link, now nested under the Studio site with a link back up to the
// family landing. Calm and documentation-adjacent — this is the front door to
// a developer tool, not a SaaS splash. Positioning and copy track the
// repository README so the two never drift.
import type { ReactElement } from 'react';
import { Button, Lbl } from '@workspec/design/components';

import { Link } from './router.js';
import { SiteNav } from './nav.js';

const REPO_URL = 'https://github.com/FieldstateNZ/workspec-decision-studio';
const NPM_URL = 'https://www.npmjs.com/package/@workspec/decision-studio';

export function Decisions(): ReactElement {
  return (
    <>
      <SiteNav
        repoUrl={REPO_URL}
        extras={
          <>
            <Link className="nav-extra" href="/decisions/demo">
              Live demo
            </Link>
            <a className="nav-extra" href={NPM_URL}>
              npm
            </a>
          </>
        }
      />
      <div className="site">
        <main>
          <section className="hero">
            <Lbl>Free · standalone · git-native</Lbl>
            <h1>Costed architecture decisions as reviewable YAML artifacts.</h1>
            <p className="lede">
              “Which platform should we run on?” usually ends up as a slide deck and a lost Slack
              thread. Decision Studio turns it into a <strong>reviewable artifact</strong>: options
              costed across dev / test / prod, weighed on the criteria that matter, and recorded as
              an ADR — all as plain <code>*.decision.yaml</code> files that live beside your code
              and version with git.
            </p>
            <div className="cta-row">
              <Button asChild>
                <Link href="/decisions/demo">Try the live demo</Link>
              </Button>
              <Button asChild variant="secondary">
                <a href={REPO_URL}>View on GitHub</a>
              </Button>
            </div>
            <p className="hero-sub">
              <strong>No database.</strong> The files in your working tree are the single source of
              truth — toggle a lever and every number reprices live; decide, and the outcome is
              written back to the YAML for your next PR.
            </p>
          </section>

          <section className="shot" aria-label="The Decision Studio workspace">
            <img
              src="/workspace.png"
              alt="The Decision Studio workspace — options costed across dev/test/prod with live optimisation levers"
              loading="lazy"
            />
          </section>

          <section className="quickstart">
            <h2>60-second quickstart</h2>
            <p>
              In any repo that has a <code>*.decision.yaml</code> (grab the examples to try it):
            </p>
            <pre className="code">
              <code>
                npx @workspec/decision-studio{'        '}# opens http://localhost:4173 over the
                working tree
              </code>
            </pre>
            <p>Prefer the terminal, or wiring into CI?</p>
            <pre className="code">
              <code>
                {
                  'npx @workspec/decision-studio validate   --dir .        # non-zero on any invalid artifact\n'
                }
                {
                  'npx @workspec/decision-studio render-adr --dir . > adr.md  # deterministic Markdown ADR'
                }
              </code>
            </pre>
          </section>

          <section className="feature">
            <h2>Schema + editor IntelliSense</h2>
            <p>
              Every artifact opens with a <code>yaml-language-server</code> directive that binds it
              to a JSON Schema, so a good editor gives you completion, hover docs, and inline
              validation as you type:
            </p>
            <pre className="code">
              <code>
                {
                  '# yaml-language-server: $schema=https://schema.workspec.io/v1alpha1/decision.schema.json\n'
                }
                {'apiVersion: workspec.io/v1alpha1\n'}
                {'kind: Decision\n'}
                {'# …'}
              </code>
            </pre>
            <p className="muted">
              The tooling writes the header for you on every save; the RedHat YAML extension reads
              it and lights up.
            </p>
          </section>

          <section className="feature">
            <h2>Open core</h2>
            <p>
              Decision Studio is the free, standalone half of WorkSpec. The{' '}
              <strong>artifact schema is shared</strong> with WorkSpec Enterprise, so the same{' '}
              <code>*.decision.yaml</code> files come alive inside the enterprise graph: the{' '}
              <code>links</code> block that renders as inert labels standalone — deployments,
              features, system requirements — resolves to real objects in Enterprise. The identical
              UI mounts inside Enterprise’s shell as a module-federation remote. No forks, one
              source.
            </p>
          </section>

          <section className="closing">
            <h2>See it move</h2>
            <p>
              The demo runs entirely in your browser against both worked examples — no install, no
              signup.
            </p>
            <Button asChild>
              <Link href="/decisions/demo">Open the live demo</Link>
            </Button>
          </section>
        </main>

        <footer className="foot">
          <span>Apache-2.0 © 2026 Fieldstate</span>
          <span className="foot-links">
            <a href={REPO_URL}>GitHub</a>
            <a href={NPM_URL}>npm</a>
            <a href="https://schema.workspec.io/v1alpha1/decision.schema.json">Schema</a>
          </span>
        </footer>
      </div>
    </>
  );
}
