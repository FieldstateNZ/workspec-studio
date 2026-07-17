// The Studio-level landing page (`/`) — Studio redesign, round 3, slice S2.
// Reproduces the Claude Design mockup's "Home" screen (WorkSpec Studio.dc.html,
// lines 74–181) structure and values verbatim, below the shared shell nav (S1).
// The mockup's 1280px column is wider than the marketing `.site` shell the
// /decisions and /c4 pitch pages still use, so this page gets its own `.home`
// class rather than reusing `.site` — see styles.css's HOME section.
//
// Copy is the mockup's approved design voice EXCEPT where it would misstate a
// fact about this repo: the mockup's recurring "one spec.yaml" shorthand is
// replaced with the real substrate (a `.workspec/` tree of artifacts, matching
// decisions.tsx / c4.tsx's own positioning copy), and its "MIT" footer becomes
// this repo's actual Apache-2.0 license.
import type { CSSProperties, ReactElement } from 'react';
import { Status } from '@workspec/design/components';
import type { StatusTone } from '@workspec/design/components';

import { Link } from './router.js';
import { SiteNav } from './nav.js';

const REPO_URL = 'https://github.com/FieldstateNZ/workspec-studio';

interface Module {
  readonly key: string;
  readonly eyebrow: string;
  readonly name: string;
  readonly status: 'live' | 'in progress' | 'new';
  readonly href: string;
  readonly blurb: string;
  readonly cta: string;
  /** `--module-accent`: the card's accent-bar / rail color. */
  readonly accent: string;
  /** `--module-eyebrow`: the eyebrow text color (per mockup, only the C4
   *  card's eyebrow gets the tinted-toward-ink treatment — Decisions' reads
   *  the accent straight). */
  readonly eyebrowColor: string;
}

// The same Status pill decision-ui uses for a decision's lifecycle (Site
// Review UX pass, finding 08 — "two status languages") — a bare mono label
// there, this dot-pill here, for what's conceptually the same idiom.
const STATUS_TONE: Record<Module['status'], StatusTone> = {
  live: 'accent',
  'in progress': 'warn',
  new: 'warn',
};

// Decisions and C4 carry the "Live" pill (both families shipped to npm); Cost
// and Traceability carry the "New" pill (warn tone), per the current home
// mockup (WorkSpec Studio.dc.html, pulled via the Design MCP). Cost shipped at
// 0.1.0-alpha.5. Traceability is DESIGNED but not yet built — its /traceability
// route does not exist yet, so its card deliberately links to a not-yet-live
// page (surfacing the roadmap, per the four-module design). The 'in progress'
// tone stays in the union for whatever module ships next.
const MODULES: readonly Module[] = [
  {
    key: 'decisions',
    eyebrow: 'module · decisions',
    name: 'Decisions',
    status: 'live',
    href: '/decisions',
    blurb:
      "Weigh options with a live cost model and optimisation levers, score the criteria that aren't cost, then write the ADR.",
    cta: 'Open the workbench',
    accent: 'var(--accent)',
    eyebrowColor: 'var(--accent)',
  },
  {
    key: 'c4',
    eyebrow: 'module · c4',
    name: 'C4 Model',
    status: 'live',
    href: '/c4',
    blurb:
      "Context → container → component, rendered from your repo's .workspec/ tree. Every element cross-links to the decisions that shaped it.",
    cta: 'Open the explorer',
    accent: 'var(--el-system)',
    // 70% to ink is the mockup's static blend, deliberately NOT
    // var(--el-tint-eyebrow): that token's dark value (100%) is paired with
    // c4-ui's 22% accent-lift step, which these static cards don't apply.
    eyebrowColor: 'color-mix(in oklab, var(--el-system) 70%, var(--ink))',
  },
  {
    key: 'cost',
    eyebrow: 'module · cost',
    name: 'Cost Attribution',
    status: 'new',
    href: '/cost',
    blurb:
      'Stock-take the cloud account, model attribution as declarative rules, write tags back as a reviewable plan.',
    cta: 'Open the workbench',
    accent: 'var(--type-scenario)',
    eyebrowColor: 'color-mix(in oklab, var(--type-scenario) 70%, var(--ink))',
  },
  {
    key: 'traceability',
    eyebrow: 'module · traceability',
    name: 'Traceability',
    status: 'new',
    href: '/traceability',
    blurb:
      'Link user & system requirements to features, generate test skeletons, then ingest CI runs into a committed coverage matrix.',
    cta: 'Open the matrix',
    // The mockup card uses its own invented --el-component accent, which isn't a
    // published @workspec/design token; map it to the real --type-feature — the
    // repo's established stand-in for that colour (see packages/cost-ui/src/
    // format.ts's C5a mapping note, and c4-ui colouring the C4 'component' kind
    // --type-feature). Apt too: traceability links requirements to features.
    accent: 'var(--type-feature)',
    eyebrowColor: 'color-mix(in oklab, var(--type-feature) 72%, var(--ink))',
  },
];

interface GrammarSample {
  readonly key: string;
  readonly kind: string;
  readonly name: string;
  /** The token var() this sample's accent, surface tint, and border tint
   *  all derive from — one accent, one derivation rule (see the closing
   *  caption below). */
  readonly accentVar: string;
}

const GRAMMAR_SAMPLES: readonly GrammarSample[] = [
  { key: 'feature', kind: 'feature', name: 'invoice-export', accentVar: '--type-feature' },
  { key: 'persona', kind: 'persona', name: 'ops-engineer', accentVar: '--type-persona' },
  { key: 'scenario', kind: 'scenario', name: 'SLA-99.9', accentVar: '--type-scenario' },
  { key: 'actor', kind: 'actor', name: 'Author', accentVar: '--el-actor' },
  { key: 'system', kind: 'system', name: 'WorkSpec Studio', accentVar: '--el-system' },
];

export function StudioHome(): ReactElement {
  return (
    // .home-shell is the mockup's sticky-footer structure: a min-height:100vh
    // flex column so the footer's margin-top:auto pins it to the viewport
    // bottom even when the content runs short.
    <div className="home-shell">
      <SiteNav repoUrl={REPO_URL} />
      <main className="home">
        <section className="home-hero" aria-label="WorkSpec Studio">
          <div className="home-hero-grid">
            <div>
              <div className="home-eyebrow">
                <span className="home-eyebrow-accent">workspec-studio</span>
                <span className="home-eyebrow-sep">/</span>
                <span>architecture workbench</span>
              </div>
              <h1 className="home-title">One typed graph. Four lenses.</h1>
              <p className="home-lede">
                A workbench over the artifacts already in your repo. Author C4 diagrams and
                architecture decisions as YAML; the studio renders them as one product — every
                option, node, link and status is a typed element with one look, on either theme.
              </p>
              <div className="home-cta-row">
                <Link href="/decisions" className="home-cta home-cta-primary">
                  Open the studio <span aria-hidden="true">→</span>
                </Link>
                <Link href="/c4" className="home-cta home-cta-outline">
                  Explore the C4 model
                </Link>
              </div>
            </div>
            <div
              className="home-terminal"
              role="group"
              aria-label="Example: starting the C4 module locally"
            >
              <div className="home-terminal-dots" aria-hidden="true">
                <span className="home-terminal-dot" />
                <span className="home-terminal-dot" />
                <span className="home-terminal-dot" />
              </div>
              <div className="home-terminal-line home-terminal-cmd">
                <code>$ npx @workspec/c4-studio serve</code>
              </div>
              <div className="home-terminal-line home-terminal-soft">
                watching .workspec/ — 42 elements · 4 decisions · 3 diagrams
              </div>
              <div className="home-terminal-line home-terminal-soft">
                studio → <span className="home-terminal-url">http://localhost:4242</span>
              </div>
              <div className="home-terminal-line home-terminal-muted">
                no account needed — your working tree is the login
              </div>
            </div>
          </div>
        </section>

        <section className="home-modules" aria-label="WorkSpec Studio modules">
          <div className="home-strip-head">
            <span className="home-strip-label">Modules</span>
            <span className="home-strip-rule" aria-hidden="true" />
            <span className="home-strip-note">four lenses over one .workspec/ tree</span>
          </div>
          <div className="home-module-grid">
            {MODULES.map((mod) => (
              <article
                key={mod.key}
                className="home-module-card"
                style={
                  {
                    '--module-accent': mod.accent,
                    '--module-eyebrow': mod.eyebrowColor,
                  } as CSSProperties
                }
              >
                <div className="home-module-body">
                  <div className="home-module-head">
                    <span className="home-module-eyebrow">{mod.eyebrow}</span>
                    <Status tone={STATUS_TONE[mod.status]} className="home-module-status">
                      {mod.status}
                    </Status>
                  </div>
                  <h2 className="home-module-title">{mod.name}</h2>
                  <p className="home-module-blurb">{mod.blurb}</p>
                  <Link href={mod.href} className="home-module-cta">
                    {mod.cta} <span aria-hidden="true">→</span>
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="home-grammar" aria-label="One element grammar">
          <div className="home-strip-head">
            <span className="home-strip-label">One element grammar</span>
            <span className="home-strip-rule" aria-hidden="true" />
            <span className="home-strip-note">
              accent → tinted surface → tinted border → eyebrow
            </span>
          </div>
          <ul className="home-grammar-grid">
            {GRAMMAR_SAMPLES.map((sample) => (
              <li
                key={sample.key}
                className="home-grammar-card"
                style={{ '--grammar-accent': `var(${sample.accentVar})` } as CSSProperties}
              >
                <div className="home-grammar-body">
                  <div className="home-grammar-eyebrow">{sample.kind}</div>
                  <div className="home-grammar-name">{sample.name}</div>
                </div>
              </li>
            ))}
          </ul>
          <p className="home-grammar-caption">
            A decision option and a C4 node are visibly siblings — one accent token, one derivation
            rule, in light or dark.
          </p>
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
