// The Cost Attribution module page (`/cost`): pitch copy (same design
// language as `/decisions` and `/c4`), a CTA into the full-page demo at
// `/cost/demo` (see `cost-demo.tsx`), and the packages list. Mirrors
// `c4.tsx`'s structure and tone exactly — full-page demo shell (Site Review
// UX pass, finding 06), not a widget embedded inline.
import type { ReactElement } from 'react';
import { Button, Lbl } from '@workspec/design/components';

import { Link } from './router.js';
import { SiteNav } from './nav.js';

const REPO_URL = 'https://github.com/FieldstateNZ/workspec-studio/tree/main/packages';

interface CostPackage {
  readonly name: string;
  readonly source: string;
  readonly blurb: string;
}

const PACKAGES: readonly CostPackage[] = [
  {
    name: '@workspec/cost-schema',
    source: `${REPO_URL}/cost-schema`,
    blurb:
      'Zod source of truth for the four cost artifact kinds (Inventory, Spend, Attribution, TagPlan) — plus generated JSON Schema.',
  },
  {
    name: '@workspec/cost-provider',
    source: `${REPO_URL}/cost-provider`,
    blurb:
      'The pluggable cost-data provider contract, vendor-neutral result types, and an in-memory test double.',
  },
  {
    name: '@workspec/cost-provider-azure',
    source: `${REPO_URL}/cost-provider-azure`,
    blurb:
      'Azure implementation — Resource Graph inventory, Cost Management spend, ARM tag apply and drift verification.',
  },
  {
    name: '@workspec/cost-engine',
    source: `${REPO_URL}/cost-engine`,
    blurb:
      'Pure, normative attribution engine — matching, resolution, effects, overrides, coverage, rollups.',
  },
  {
    name: '@workspec/cost-ui',
    source: `${REPO_URL}/cost-ui`,
    blurb:
      'Host-agnostic React views — the unified Attribution Workbench, Inventory, Reports, and Plan review.',
  },
  {
    name: '@workspec/cost-studio',
    source: `${REPO_URL}/cost-studio`,
    blurb:
      'The CLI (workspec-cost: stocktake, validate, report, plan, apply) and localhost host shell.',
  },
];

export function Cost(): ReactElement {
  return (
    <>
      <SiteNav
        repoUrl={REPO_URL}
        extras={
          <Link className="nav-extra" href="/cost/demo">
            Live demo
          </Link>
        }
      />
      <div className="site">
        <main>
          <section className="hero">
            <Lbl>Free · standalone · git-native</Lbl>
            <h1>Stock-take a cloud estate, attribute its spend, and converge live tags.</h1>
            <p className="lede">
              The Cost Attribution module reads a plain YAML inventory and spend snapshot, resolves
              every resource's spend against dimensions you declare (product, team, cost type,
              client — whatever your organisation actually reports on), and computes the tagging
              diff that converges live cloud tags on that result — straight from artifacts that live
              in your repo and version with git, no database, ever.
            </p>
            <div className="cta-row">
              <Button asChild>
                <Link href="/cost/demo">Try the live demo</Link>
              </Button>
              <Button asChild variant="secondary">
                <a href={REPO_URL}>View on GitHub</a>
              </Button>
            </div>
          </section>

          <section className="closing">
            <h2>Start with the example, then use your own subscription</h2>
            <p>
              A live Attribution Workbench running entirely in your browser against a worked example
              estate — no install, no signup, fully editable. To use the same human-and-agent
              workflow on your own Azure estate, stocktake it locally and serve the resulting YAML:
            </p>
            <pre>
              <code>{`az login
npx @workspec/cost-studio@alpha stocktake --subscription <id>
npx @workspec/cost-studio@alpha serve`}</code>
            </pre>
            <p>
              Open <code>http://127.0.0.1:4173</code> in ChatGPT. The agent can inspect the
              stocktake, create the first attribution with you, preview each proposed rule, and
              write approved rules back to the local YAML. Azure changes remain a separate plan,
              dry-run, and explicit apply.
            </p>
            <Button asChild>
              <Link href="/cost/demo">Open the live demo</Link>
            </Button>
          </section>

          <section className="feature">
            <h2>The packages so far</h2>
            <p className="muted">Source on GitHub, publishing at 0.1.0-alpha.</p>
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
