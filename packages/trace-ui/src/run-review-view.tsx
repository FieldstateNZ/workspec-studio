// Run review (spec §5): the LATEST run, failures foregrounded. This is a
// VIEW-LAYER PROJECTION over the derived `TraceModel` (`model.scenarios` +
// each scenario's `evidence`, `model.latestRun` for the run's own identity) —
// NOT a re-derivation of the three meters (`MetersBar` stays the only
// repo-level coverage/pass numbers this package claims) and not a second copy
// of `FeatureDetail`'s per-feature scenario rows: this view groups by PROOF
// first (fail → skip → unproven → pass), across every feature, because the
// question this surface answers is "what do I need to fix in the run that
// just happened", not "what does this feature look like".
//
// Design adaptations from `docs/design/Traceability Workbench.dc.html`'s Run
// review mock (see the package README's "Design adaptations" section for the
// same convention applied to the other three views):
//
//   • v0 is LATEST-RUN-ONLY (spec §9.4: "coverage-over-time is v0.1") — there
//     is no run picker (`rr.picker`/`TESTRUNS`) the way the mock lets you
//     select among several historical runs; this view only ever renders
//     `model.latestRun`. Multi-run history is a deferred v0.1 concern, not
//     invented here.
//   • No "unmatched tests" section. The mock's `rr.unmatched` modelled tests
//     that ran but resolved to no requirement ID — but the validated
//     `TestRun.results` (`@workspec/req-schema`) keys PURELY on scenario slug
//     (spec §4.5/§4.6): there is no slot for a test that resolved to nothing,
//     so `TraceModel` carries no equivalent concept for this view to render.
//   • No `file`/CI-link field. The mock's `rr.file` (a synthetic
//     `.workspec/runs/<id>.testrun.yaml` path) and `rr.ci` (a clickable CI
//     URL) don't exist on `RunRef` — `RunRef.ci` is a CI PROVIDER LABEL (e.g.
//     "github-actions"), not a URL (see `@workspec/trace-model`'s
//     `types.ts`), so it renders as plain text, not a link.
//   • Each scenario row shows title/slug/proof/evidence plus its own small
//     Rule + Feature join (`withContext` below) instead of the mock's
//     `fl.chain` string built from a flat `<sysreq>/<scenario-id>` key — the
//     validated model keys scenarios on their own slug (spec §4.5/§4.6), so
//     this view resolves the Rule → Feature chain from `model.systemRequirements`
//     / `model.features` directly.
import { useState } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import type {
  FeatureNode,
  RunRef,
  ScenarioNode,
  ScenarioProof,
  SysReqNode,
  TraceModel,
} from '@workspec/trace-model';
import { formatProofTally, PROOF_ACCENT, PROOF_LABEL, tallyProofs } from './format.js';
import { TraceThemedRoot } from './themed-root.js';
import type { ThemeName } from './themes.js';

/** Props for {@link RunReviewView}. */
export interface RunReviewViewProps {
  model: TraceModel;
  theme?: ThemeName | undefined;
  className?: string | undefined;
}

/** A scenario resolved against its parent Rule and Feature — this view's own small join, not a model concern (mirrors `MatrixView`'s `buildFeatureGroups` in spirit: a local projection, not a new `trace-model` lookup). */
interface ScenarioContext {
  scenario: ScenarioNode;
  rule: SysReqNode | undefined;
  feature: FeatureNode | undefined;
}

function withContext(model: TraceModel, scenario: ScenarioNode): ScenarioContext {
  const rule = model.systemRequirements.find((r) => r.slug === scenario.systemRequirement);
  const feature =
    rule !== undefined ? model.features.find((f) => f.slug === rule.feature) : undefined;
  return { scenario, rule, feature };
}

/** "Feature name › Rule title", falling back to the raw (unresolved) slug when a ref is dangling — rendered inert, never a crash. */
function chainLabel(ctx: ScenarioContext): string {
  const featureLabel = ctx.feature?.name ?? ctx.rule?.feature ?? 'unknown feature';
  const ruleLabel = ctx.rule?.title ?? ctx.scenario.systemRequirement;
  return `${featureLabel} › ${ruleLabel}`;
}

/** The scenario's evidence line — identical wording to `FeatureDetail`'s own `ScenarioRow` (each view derives its own tiny copy rather than sharing view-internal helpers across files; see `MatrixView`'s equivalent note). */
function evidenceLine(scenario: ScenarioNode): string {
  return scenario.evidence !== undefined
    ? `proven by ${scenario.evidence.runId} · ${scenario.evidence.at}${scenario.evidence.sha !== undefined ? ` · ${scenario.evidence.sha}` : ''}`
    : 'unproven — absent from the latest run';
}

/** The foregrounding order (spec §5): failures first — "these are what a user fixes" — then skipped, then unproven. `pass` is deliberately excluded: it renders via its own collapsible `RunPassingSection`, never in this always-expanded list. */
const FOREGROUND_ORDER: readonly ScenarioProof[] = ['fail', 'skip', 'unproven'];

const SECTION_LABEL: Record<ScenarioProof, string> = {
  fail: 'Failures',
  skip: 'Skipped',
  unproven: 'Unproven',
  pass: 'Passing',
};

const SECTION_EMPTY_MESSAGE: Record<ScenarioProof, string> = {
  fail: 'No failures in this run.',
  skip: 'No skipped scenarios in this run.',
  unproven: 'No unproven scenarios in this run.',
  pass: 'No scenarios passed in this run.',
};

/** Run review: the latest run's scenarios, grouped and ordered by proof so failures are the first and most prominent thing on the page. */
export function RunReviewView(props: RunReviewViewProps): ReactElement {
  const { model, theme, className } = props;
  const [passingOpen, setPassingOpen] = useState(false);

  if (model.latestRun === null) {
    return (
      <TraceThemedRoot theme={theme} className={className}>
        <div className="trace-run-review">
          <div className="trace-chain-empty">No evidence ingested yet.</div>
        </div>
      </TraceThemedRoot>
    );
  }

  const byProof: Record<ScenarioProof, ScenarioNode[]> = {
    fail: [],
    skip: [],
    unproven: [],
    pass: [],
  };
  for (const scenario of model.scenarios) byProof[scenario.proof].push(scenario);

  // Nothing to foreground: every scenario passed. A distinct, positive state
  // (spec: "no failures to foreground") rather than three empty fail/skip/
  // unproven boxes stacked above the passing list.
  const allPassing =
    byProof.fail.length === 0 && byProof.skip.length === 0 && byProof.unproven.length === 0;

  const summary = formatProofTally(tallyProofs(model.scenarios.map((s) => s.proof)));

  return (
    <TraceThemedRoot theme={theme} className={className}>
      <div className="trace-run-review">
        <RunHeader run={model.latestRun} summary={summary} />

        {allPassing ? (
          <div className="trace-chain-empty trace-chain-empty--positive">
            Every scenario passed in the latest run — nothing to foreground.
          </div>
        ) : (
          FOREGROUND_ORDER.map((proof) => (
            <RunProofSection key={proof} proof={proof} scenarios={byProof[proof]} model={model} />
          ))
        )}

        <RunPassingSection
          scenarios={byProof.pass}
          model={model}
          open={passingOpen}
          onToggle={() => setPassingOpen((v) => !v)}
        />
      </div>
    </TraceThemedRoot>
  );
}

/** The run-metadata header: id / ts / sha / ci / emitter (from `RunRef`), plus the repo-wide proof tally reused verbatim from `format.ts` (the same string `MetersBar` shows). */
function RunHeader(props: { run: RunRef; summary: string }): ReactElement {
  const { run, summary } = props;
  return (
    <div className="trace-run-header">
      <div className="trace-run-header-meta">
        <span className="trace-run-header-id">{run.id}</span>
        <span className="trace-run-header-meta-item">{run.ts}</span>
        {run.sha !== undefined && <span className="trace-run-header-meta-item">{run.sha}</span>}
        {run.ci !== undefined && (
          <span className="trace-run-header-meta-item">{`ci ${run.ci}`}</span>
        )}
        <span className="trace-run-header-meta-item">{`emitter ${run.emitter}`}</span>
      </div>
      <span className="trace-run-header-summary">{summary}</span>
    </div>
  );
}

/** One non-collapsible proof bucket (fail / skip / unproven) — always fully expanded, since these are exactly the things a user is here to see. */
function RunProofSection(props: {
  proof: ScenarioProof;
  scenarios: ScenarioNode[];
  model: TraceModel;
}): ReactElement {
  const { proof, scenarios, model } = props;
  return (
    <div className="trace-run-section">
      <span
        className="trace-run-section-label"
        style={{ '--chip-accent': PROOF_ACCENT[proof] } as CSSProperties}
      >
        {`${SECTION_LABEL[proof]} · ${scenarios.length}`}
      </span>
      {scenarios.length === 0 ? (
        <div
          className={`trace-chain-empty${proof === 'fail' ? ' trace-chain-empty--positive' : ''}`}
        >
          {SECTION_EMPTY_MESSAGE[proof]}
        </div>
      ) : (
        <div className="trace-rule-card">
          {scenarios.map((scenario) => (
            <RunScenarioRow key={scenario.slug} ctx={withContext(model, scenario)} />
          ))}
        </div>
      )}
    </div>
  );
}

/** The passing bucket — summarized and collapsed by default (spec: "passing (summarized/collapsible)"), since a clean run is exactly what a user does NOT need to inspect row by row. */
function RunPassingSection(props: {
  scenarios: ScenarioNode[];
  model: TraceModel;
  open: boolean;
  onToggle: () => void;
}): ReactElement {
  const { scenarios, model, open, onToggle } = props;
  return (
    <div className="trace-run-section">
      <div
        className="trace-run-section-header"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onToggle();
          }
        }}
      >
        <span className="trace-matrix-chevron">{open ? '▾' : '▸'}</span>
        <span
          className="trace-run-section-label"
          style={{ '--chip-accent': PROOF_ACCENT.pass } as CSSProperties}
        >
          {`${SECTION_LABEL.pass} · ${scenarios.length}`}
        </span>
      </div>
      {open &&
        (scenarios.length === 0 ? (
          <div className="trace-chain-empty">{SECTION_EMPTY_MESSAGE.pass}</div>
        ) : (
          <div className="trace-rule-card">
            {scenarios.map((scenario) => (
              <RunScenarioRow key={scenario.slug} ctx={withContext(model, scenario)} />
            ))}
          </div>
        ))}
    </div>
  );
}

/** One scenario row: slug, title, its Rule + Feature context, and its proof — the same `trace-scenario-*` markup and `PROOF_ACCENT`/`PROOF_LABEL` pills `FeatureDetail`'s `ScenarioRow` uses, plus one extra line for the chain context this view adds. */
function RunScenarioRow(props: { ctx: ScenarioContext }): ReactElement {
  const { scenario } = props.ctx;
  return (
    <div className="trace-scenario-row">
      <span
        className="trace-proof-dot"
        style={{ '--chip-accent': PROOF_ACCENT[scenario.proof] } as CSSProperties}
      />
      <div className="trace-scenario-body">
        <div className="trace-scenario-line1">
          <span className="trace-scenario-title">{scenario.title}</span>
          <span className="trace-scenario-slug">{scenario.slug}</span>
          <span
            className="trace-pill"
            style={{ '--chip-accent': PROOF_ACCENT[scenario.proof] } as CSSProperties}
          >
            {PROOF_LABEL[scenario.proof]}
          </span>
        </div>
        <span className="trace-scenario-chain">{chainLabel(props.ctx)}</span>
        <span className="trace-scenario-evidence">{evidenceLine(scenario)}</span>
      </div>
    </div>
  );
}
