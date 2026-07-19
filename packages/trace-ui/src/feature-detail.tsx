// Feature detail (spec §5): a feature → its userReqs → its Rules (system-
// requirements) → each Rule's scenarios, with per-scenario proof — and the
// no-sysreq / empty-rule cases rendered EXPLICITLY rather than as a silent
// gap (spec §5's own wording). Follows the design's feature-detail layout
// (picker row, header + coverage figures, provenance strip, userreqs,
// Rules-with-scenarios), adapted to what the derived `TraceModel` carries:
//
//   • No Gherkin Given/When/Then text and no "As X, I want Y, so that Z"
//     narrative — `ScenarioNode`/`UserReqNode` don't carry those fields (they
//     live on the raw artifacts, which this view never reads; see the
//     package README's design-adaptation note). Each scenario row instead
//     shows its title, slug, proof, and evidence provenance (run id/sha/ts).
//   • No per-feature "product" chip — `FeatureNode` doesn't carry `product`.
//   • Coverage/pass FIGURES shown per feature are a local view-layer
//     aggregation over the scenarios reachable from this feature's Rules
//     (`featureRollup` below) — NOT a fourth model meter. The three meters
//     (`MetersBar`) stay the only repo-level numbers this package claims are
//     "the" coverage/pass rate (spec §5: never collapsed, never duplicated).
import { useState } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import type { ScenarioNode, TraceModel } from '@workspec/trace-model';
import { scenariosOf, sysreqsOf, userReqsOf } from '@workspec/trace-model';
import { PROOF_ACCENT, PROOF_LABEL, STATUS_ACCENT } from './format.js';
import { TraceThemedRoot } from './themed-root.js';
import type { ThemeName } from './themes.js';

/** Props for {@link FeatureDetail}. */
export interface FeatureDetailProps {
  model: TraceModel;
  /** Which feature to show. Controlled when given; falls back to internal state (defaulting to the first feature) when omitted. */
  featureSlug?: string | undefined;
  /** Called when the picker row selects a different feature. */
  onFeatureChange?: ((slug: string) => void) | undefined;
  theme?: ThemeName | undefined;
  className?: string | undefined;
}

interface FeatureRollup {
  total: number;
  evidenced: number;
  passed: number;
}

/** View-layer aggregation over a feature's reachable scenarios — display only, not a model meter. */
function featureRollup(scenarios: readonly ScenarioNode[]): FeatureRollup {
  const evidenced = scenarios.filter((s) => s.proof !== 'unproven').length;
  const passed = scenarios.filter((s) => s.proof === 'pass').length;
  return { total: scenarios.length, evidenced, passed };
}

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return '—';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

/** Feature → userReqs → Rules → scenarios, with the empty-rule/no-sysreq cases explicit. */
export function FeatureDetail(props: FeatureDetailProps): ReactElement {
  const { model, theme, className } = props;
  const [uncontrolledSlug, setUncontrolledSlug] = useState<string | null>(
    () => model.features[0]?.slug ?? null,
  );
  const selectedSlug = props.featureSlug ?? uncontrolledSlug;

  function selectFeature(slug: string): void {
    if (props.featureSlug === undefined) setUncontrolledSlug(slug);
    props.onFeatureChange?.(slug);
  }

  if (model.features.length === 0) {
    return (
      <TraceThemedRoot theme={theme} className={className}>
        <div className="trace-feature-detail">
          <div className="trace-chain-empty">No features in this tree yet.</div>
        </div>
      </TraceThemedRoot>
    );
  }

  const feature = model.features.find((f) => f.slug === selectedSlug) ?? model.features[0];

  return (
    <TraceThemedRoot theme={theme} className={className}>
      <div className="trace-feature-detail">
        <div className="trace-feature-picker">
          {model.features.map((f) => (
            <button
              key={f.slug}
              type="button"
              className={`trace-feature-chip${f.slug === feature?.slug ? ' trace-feature-chip--active' : ''}`}
              onClick={() => selectFeature(f.slug)}
            >
              {f.name}
            </button>
          ))}
        </div>

        {feature && <FeatureBody model={model} featureSlug={feature.slug} />}
      </div>
    </TraceThemedRoot>
  );
}

function FeatureBody(props: { model: TraceModel; featureSlug: string }): ReactElement {
  const { model, featureSlug } = props;
  const feature = model.features.find((f) => f.slug === featureSlug);
  if (!feature) {
    return <div className="trace-chain-empty">Feature not found.</div>;
  }

  const rules = sysreqsOf(model, featureSlug);
  const scenarios = rules.flatMap((rule) => scenariosOf(model, rule.slug));
  const rollup = featureRollup(scenarios);
  const userReqs = userReqsOf(model, featureSlug);
  const latestRun = model.latestRun;

  return (
    <div className="trace-feature-body">
      <div className="trace-feature-header">
        <div className="trace-feature-heading">
          <h2 className="trace-feature-name">{feature.name}</h2>
          <span className="trace-feature-slug">
            {rules.length > 0
              ? `${feature.slug} · ${rules.length} rule${rules.length === 1 ? '' : 's'} · ${scenarios.length} scenario${scenarios.length === 1 ? '' : 's'} · ${userReqs.length} userreq${userReqs.length === 1 ? '' : 's'}`
              : `${feature.slug} · uncovered — no system requirements yet`}
          </span>
        </div>
        <div className="trace-feature-figures">
          <div className="trace-feature-figure">
            <span className="trace-feature-figure-label">coverage</span>
            <span className="trace-feature-figure-value">
              {pct(rollup.evidenced, rollup.total)}
            </span>
          </div>
          <div className="trace-feature-figure">
            <span className="trace-feature-figure-label">pass</span>
            <span className="trace-feature-figure-value">
              {pct(rollup.passed, rollup.evidenced)}
            </span>
          </div>
        </div>
      </div>

      <div className="trace-feature-provenance">
        <span className="trace-feature-provenance-label">latest run</span>
        {latestRun ? (
          <>
            <span className="trace-feature-provenance-value">{latestRun.id}</span>
            <span className="trace-feature-provenance-meta">{latestRun.ts}</span>
            {latestRun.sha !== undefined && (
              <span className="trace-feature-provenance-meta">{latestRun.sha}</span>
            )}
            <span className="trace-feature-provenance-meta">{`emitter ${latestRun.emitter}`}</span>
          </>
        ) : (
          <span className="trace-feature-provenance-value">No runs ingested yet.</span>
        )}
      </div>

      <div className="trace-feature-section">
        <span className="trace-feature-section-label">User requirements</span>
        {userReqs.length === 0 ? (
          <div className="trace-chain-empty">
            No user requirements attached to this feature yet.
          </div>
        ) : (
          userReqs.map((userReq) => (
            <div className="trace-userreq-row" key={userReq.slug}>
              <span className="trace-userreq-title">{userReq.title}</span>
              <span className="trace-userreq-slug">{userReq.slug}</span>
              <span className="trace-userreq-actor">{userReq.actor}</span>
              <span
                className="trace-status-pill"
                style={{ '--chip-accent': STATUS_ACCENT[userReq.status] } as CSSProperties}
              >
                <span
                  className="trace-status-dot"
                  style={{ '--chip-accent': STATUS_ACCENT[userReq.status] } as CSSProperties}
                />
                {userReq.status}
              </span>
            </div>
          ))
        )}
      </div>

      <div className="trace-feature-section">
        <span className="trace-feature-section-label">System requirements</span>
        {rules.length === 0 ? (
          <div className="trace-chain-empty trace-chain-empty--warn">
            This feature has no system requirements yet — it is uncovered.
          </div>
        ) : (
          rules.map((rule) => <RuleCard key={rule.slug} model={model} ruleSlug={rule.slug} />)
        )}
      </div>
    </div>
  );
}

function RuleCard(props: { model: TraceModel; ruleSlug: string }): ReactElement {
  const rule = props.model.systemRequirements.find((r) => r.slug === props.ruleSlug);
  const scenarios = scenariosOf(props.model, props.ruleSlug);
  if (!rule) return <></>;

  return (
    <div className="trace-rule-card">
      <div className="trace-rule-card-header">
        <span className="trace-rule-card-title">{rule.title}</span>
        <span className="trace-rule-card-slug">{rule.slug}</span>
      </div>

      {scenarios.length === 0 ? (
        <div className="trace-chain-empty trace-chain-empty--warn">
          This Rule has no scenarios yet — a requirement with no proof.
        </div>
      ) : (
        scenarios.map((scenario) => <ScenarioRow key={scenario.slug} scenario={scenario} />)
      )}
    </div>
  );
}

function ScenarioRow(props: { scenario: ScenarioNode }): ReactElement {
  const { scenario } = props;
  const evidenceLine =
    scenario.evidence !== undefined
      ? `proven by ${scenario.evidence.runId} · ${scenario.evidence.at}${scenario.evidence.sha !== undefined ? ` · ${scenario.evidence.sha}` : ''}`
      : 'unproven — absent from the latest run';

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
        <span className="trace-scenario-evidence">{evidenceLine}</span>
      </div>
    </div>
  );
}
