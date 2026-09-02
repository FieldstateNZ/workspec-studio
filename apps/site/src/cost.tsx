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
const AZURE_SETUP_URL =
  'https://github.com/FieldstateNZ/workspec-studio/blob/main/docs/cost/azure-setup.md';

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
          <>
            <a className="nav-extra" href="#quickstart">
              Docs
            </a>
            <Link className="nav-extra" href="/cost/demo">
              Live demo
            </Link>
          </>
        }
      />
      <div className="site cost-site">
        <main>
          <section className="cost-hero">
            <div className="cost-hero-copy">
              <div className="cost-kicker">
                <Lbl>Open-source FinOps workbench</Lbl>
                <span>Azure today · multi-cloud architecture · agent-ready</span>
              </div>
              <h1>Turn cloud cost attribution into a conversation.</h1>
              <p className="cost-hero-lede">
                Stock-take your Azure estate into reviewable YAML, open the live workbench, and work
                with an agent to explain every unattributed dollar—before anything changes in Azure.
              </p>
              <div className="cta-row cost-hero-actions">
                <Button asChild>
                  <Link href="/cost/demo">Explore the live workbench</Link>
                </Button>
                <a className="cost-text-link" href="#quickstart">
                  Use your subscription <span aria-hidden="true">↓</span>
                </a>
              </div>
              <ul className="cost-trust-row" aria-label="Product principles">
                <li>
                  <strong>Local</strong>
                  <span>Your cloud data stays on your machine</span>
                </li>
                <li>
                  <strong>Reviewable</strong>
                  <span>Every decision is plain YAML</span>
                </li>
                <li>
                  <strong>Guarded</strong>
                  <span>Preview and dry-run before apply</span>
                </li>
              </ul>
            </div>

            <aside className="cost-terminal" aria-label="Cost Studio quick start">
              <div className="cost-terminal-bar">
                <span className="cost-terminal-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span>cost-review</span>
                <span className="cost-terminal-status">local</span>
              </div>
              <div className="cost-terminal-body">
                <p>
                  <span className="cost-prompt">$</span> az login
                </p>
                <p>
                  <span className="cost-prompt">$</span> npx @workspec/cost-studio@alpha
                  <br />
                  &nbsp;&nbsp;stocktake --subscription &lt;id&gt;
                </p>
                <p className="cost-terminal-output">✓ 80 resources · $13,165/mo</p>
                <p>
                  <span className="cost-prompt">$</span> npx @workspec/cost-studio@alpha serve
                </p>
                <div className="cost-terminal-ready">
                  <span className="cost-ready-dot" aria-hidden="true" />
                  <span>
                    <strong>Cost Studio ready</strong>
                    <br />
                    http://127.0.0.1:4173
                  </span>
                </div>
              </div>
              <div className="cost-terminal-foot">
                <span>WebMCP</span>
                <strong>5 agent tools available</strong>
              </div>
            </aside>
          </section>

          <section className="cost-provider-strip" aria-label="Cloud provider support">
            <span className="cost-provider-label">Cloud providers</span>
            <span className="cost-provider-item cost-provider-live">
              <strong>Azure</strong>
              <span>available now</span>
            </span>
            <span className="cost-provider-separator" aria-hidden="true" />
            <span className="cost-provider-item">
              <strong>AWS</strong>
              <span>planned</span>
            </span>
            <span className="cost-provider-separator" aria-hidden="true" />
            <span className="cost-provider-item">
              <strong>Others</strong>
              <span>via the provider interface</span>
            </span>
          </section>

          <section className="cost-story" aria-labelledby="cost-story-title">
            <div className="cost-section-head">
              <p className="cost-section-label">The workflow</p>
              <h2 id="cost-story-title">From cloud bill to a reviewed decision.</h2>
              <p>
                Cost Studio keeps collection, interpretation, and cloud mutation as separate steps.
                You can bring an agent into the middle without handing it the keys to the end.
              </p>
            </div>
            <ol className="cost-flow">
              <li>
                <span className="cost-flow-number">01</span>
                <strong>Stock-take</strong>
                <p>Read Azure inventory and spend into stable, diffable files.</p>
                <code>stocktake</code>
              </li>
              <li>
                <span className="cost-flow-number">02</span>
                <strong>Explain</strong>
                <p>Find coverage gaps and agree the dimensions your organisation uses.</p>
                <code>serve + WebMCP</code>
              </li>
              <li>
                <span className="cost-flow-number">03</span>
                <strong>Review</strong>
                <p>Preview rules, inspect their matches, and keep the reasoning in YAML.</p>
                <code>validate · report · plan</code>
              </li>
              <li>
                <span className="cost-flow-number">04</span>
                <strong>Converge</strong>
                <p>Simulate the tag plan, verify live state, then apply deliberately.</p>
                <code>apply --dry-run</code>
              </li>
            </ol>
          </section>

          <section id="quickstart" className="cost-docs" aria-labelledby="quickstart-title">
            <div className="cost-docs-aside">
              <p className="cost-section-label">Documentation</p>
              <h2 id="quickstart-title">Use Cost Studio with your Azure subscription.</h2>
              <p>
                You need Node.js 22+, the Azure CLI, and read access to Resource Graph and Cost
                Management. Tag writes need additional permission only when you explicitly apply.
              </p>
              <a className="cost-doc-link" href={AZURE_SETUP_URL}>
                Azure roles and least privilege <span aria-hidden="true">↗</span>
              </a>
              <nav className="cost-doc-nav" aria-label="On this page">
                <a href="#collect">1. Collect your estate</a>
                <a href="#collaborate">2. Open the workbench</a>
                <a href="#review">3. Review attribution</a>
                <a href="#apply">4. Plan and apply</a>
                <a href="#reference">CLI reference</a>
              </nav>
            </div>

            <div className="cost-doc-steps">
              <article id="collect" className="cost-doc-step">
                <div className="cost-step-heading">
                  <span>01</span>
                  <div>
                    <p>Collect</p>
                    <h3>Snapshot the estate and its spend.</h3>
                  </div>
                </div>
                <p>
                  Sign in, choose an empty review directory, and run a stock-take. Repeat
                  <code> --subscription</code> to combine subscriptions; use <code>--period</code>
                  for a month other than the current one.
                </p>
                <pre className="cost-code">
                  <code>{`az login
mkdir cost-review && cd cost-review

npx @workspec/cost-studio@alpha stocktake \\
  --subscription <subscription-id>`}</code>
                </pre>
                <p className="cost-note">
                  This reads Azure. It writes only local <code>.workspec</code> YAML files.
                </p>
              </article>

              <article id="collaborate" className="cost-doc-step">
                <div className="cost-step-heading">
                  <span>02</span>
                  <div>
                    <p>Collaborate</p>
                    <h3>Open the local workbench.</h3>
                  </div>
                </div>
                <p>
                  Start the server from the same directory, then open the printed localhost URL in
                  ChatGPT's browser and enable site tools. Nothing is uploaded to WorkSpec.
                </p>
                <pre className="cost-code">
                  <code>{`npx @workspec/cost-studio@alpha serve
# open http://127.0.0.1:4173`}</code>
                </pre>
                <div className="cost-tool-switch">
                  <div>
                    <span>First run</span>
                    <strong>2 setup tools</strong>
                    <p>Inspect the stock-take and create the first attribution together.</p>
                  </div>
                  <span className="cost-tool-arrow" aria-hidden="true">
                    →
                  </span>
                  <div>
                    <span>Attribution ready</span>
                    <strong>5 working tools</strong>
                    <p>Inspect gaps, preview rules, and write only approved rules.</p>
                  </div>
                </div>
              </article>

              <article id="review" className="cost-doc-step">
                <div className="cost-step-heading">
                  <span>03</span>
                  <div>
                    <p>Review</p>
                    <h3>Close gaps with evidence.</h3>
                  </div>
                </div>
                <p>Ask the agent to start broad and make each proposed rule explain itself:</p>
                <blockquote className="cost-prompt-card">
                  “Show me the largest unattributed cluster, inspect the resources behind it, and
                  preview the narrowest rule that would classify them. Don't apply it yet.”
                </blockquote>
                <p>
                  A preview is read-only. Applying a preview adds one rule to the attribution YAML
                  and refreshes the workbench; it does not modify Azure tags.
                </p>
              </article>

              <article id="apply" className="cost-doc-step">
                <div className="cost-step-heading">
                  <span>04</span>
                  <div>
                    <p>Converge</p>
                    <h3>Keep cloud writes behind review gates.</h3>
                  </div>
                </div>
                <p>
                  Validate the artifacts, review coverage, generate the tag plan, then simulate it.
                  Remove <code>--dry-run</code> only after the YAML and results are approved.
                </p>
                <pre className="cost-code">
                  <code>{`npx @workspec/cost-studio@alpha validate
npx @workspec/cost-studio@alpha report
npx @workspec/cost-studio@alpha plan
npx @workspec/cost-studio@alpha apply \\
  .workspec/tagplans/<period>.yaml --dry-run`}</code>
                </pre>
                <div className="cost-safety-callout">
                  <strong>Safe by construction</strong>
                  <p>
                    Apply verifies that live Azure state still matches the stock-take baseline. If
                    anything drifted, it refuses and asks you to stock-take and plan again.
                  </p>
                </div>
              </article>
            </div>
          </section>

          <section id="reference" className="cost-reference" aria-labelledby="reference-title">
            <div className="cost-section-head cost-section-head-row">
              <div>
                <p className="cost-section-label">CLI reference</p>
                <h2 id="reference-title">One tool, six deliberate commands.</h2>
              </div>
              <p>
                Run any command with <code>--help</code> for every option.
              </p>
            </div>
            <div className="cost-command-grid">
              <article>
                <code>stocktake</code>
                <p>Fetch Azure inventory and monthly spend into stable YAML paths.</p>
                <span>Azure read · local write</span>
              </article>
              <article>
                <code>serve</code>
                <p>Run the browser workbench and its focused WebMCP tools on localhost.</p>
                <span>Local only</span>
              </article>
              <article>
                <code>validate</code>
                <p>Validate every cost artifact and surface attribution diagnostics.</p>
                <span>Read only</span>
              </article>
              <article>
                <code>report</code>
                <p>Print coverage, unattributed spend, and rollups by dimension.</p>
                <span>Read only</span>
              </article>
              <article>
                <code>plan</code>
                <p>Compute the exact tag additions, changes, removals, and no-ops.</p>
                <span>Local write</span>
              </article>
              <article>
                <code>apply</code>
                <p>Verify the baseline and execute—or simulate—the reviewed tag plan.</p>
                <span>Azure write · guarded</span>
              </article>
            </div>
          </section>

          <section className="cost-artifacts" aria-labelledby="artifacts-title">
            <div>
              <p className="cost-section-label">Git-native by design</p>
              <h2 id="artifacts-title">The files are the product.</h2>
              <p>
                Cost Studio has no database and never invokes git. Re-run a stock-take and
                <code> git diff</code> becomes your estate drift report. Review, commit, branch, and
                merge the same way you do code.
              </p>
            </div>
            <pre className="cost-file-tree">
              <code>{`.workspec/
├── inventories/estate.yaml
├── spends/estate-2026-09.yaml
├── attributions/product.yaml
└── tagplans/2026-09.yaml`}</code>
            </pre>
          </section>

          <section className="cost-packages" aria-labelledby="packages-title">
            <div className="cost-section-head cost-section-head-row">
              <div>
                <p className="cost-section-label">Open source</p>
                <h2 id="packages-title">Composable from schema to studio.</h2>
              </div>
              <p>
                Apache-2.0 · publishing on npm at <code>alpha</code>
              </p>
            </div>
            <div className="cost-package-grid">
              {PACKAGES.map((pkg) => (
                <article key={pkg.name}>
                  <a href={pkg.source}>
                    <code>{pkg.name}</code>
                  </a>
                  <p>{pkg.blurb}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="cost-closing">
            <p className="cost-section-label">Try it now</p>
            <h2>See the conversation before connecting your cloud.</h2>
            <p>
              The worked example is editable, requires no account, and exposes the same agent tools
              as the local Cost Studio workflow.
            </p>
            <div className="cta-row">
              <Button asChild>
                <Link href="/cost/demo">Open the live workbench</Link>
              </Button>
              <Button asChild variant="secondary">
                <a href={REPO_URL}>Browse the source</a>
              </Button>
            </div>
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
