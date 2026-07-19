// The Matrix view (spec §5): the RTM — "scenario rows grouped by Rule →
// Feature, exportable". This is a VIEW-LAYER PROJECTION over the derived
// `TraceModel` (`model.features` + `sysreqsOf`/`scenariosOf` from
// `@workspec/trace-model`) — NOT a re-derivation of the three meters
// (`MetersBar` stays the only repo-level coverage/pass numbers this package
// claims), and NOT the same code as `@workspec/trace-studio`'s
// `buildMatrixRows` (that package's flat CSV/MD/HTML row projection for the
// `workspec-trace matrix` export — trace-ui cannot depend on trace-studio, so
// this view derives its own nested Feature → Rule → Scenario grouping
// straight from the model, independently). See the package README's "Design
// adaptations" section for why this differs from
// `docs/design/Traceability Workbench.dc.html`'s Matrix mock:
//
//   • v0 is LATEST-RUN-ONLY (spec §9.4: "coverage-over-time is v0.1") — each
//     scenario shows its single latest-run `proof`, never a per-run history
//     sparkline the way the mock's `sc.spark` does.
//   • No "Heatmap" density toggle, no multi-select "Fix coverage" triage bar
//     (the mock's `mx.sel`/`showTriage`/`workspec-trace generate` flow) — the
//     brief scopes v0 to expand/collapse groups, an untested-only filter, and
//     the empty-rule/no-sysreq cases shown explicitly; `generateSkeletons` on
//     `TraceStudioCapabilities` stays unconsumed until that flow is scoped.
//   • No in-UI export button — the export IS the CLI (`workspec-trace
//     matrix --out matrix.{md,csv,html}`, spec §6); the toolbar hint below is
//     a documented pointer to that command, not a broken affordance.
//
// Groups default OPEN (every feature and every Rule expanded) so the full RTM
// — including the empty-rule/uncovered-feature explicit cases — renders
// without any interaction, matching what an auditor loading a compliance
// artifact expects to see; collapsing a group is available but opt-in.
import { useMemo, useState } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import type {
  FeatureNode,
  ScenarioNode,
  ScenarioProof,
  SysReqNode,
  TraceModel,
} from '@workspec/trace-model';
import { scenariosOf, sysreqsOf } from '@workspec/trace-model';
import { formatProofTally, PROOF_ACCENT, PROOF_LABEL, tallyProofs } from './format.js';
import { TraceThemedRoot } from './themed-root.js';
import type { ThemeName } from './themes.js';

/** Props for {@link MatrixView}. */
export interface MatrixViewProps {
  model: TraceModel;
  theme?: ThemeName | undefined;
  className?: string | undefined;
}

/** One Rule's scenarios, resolved via `scenariosOf` — the RTM's inner grouping level. */
interface RuleGroup {
  rule: SysReqNode;
  /** Every scenario under this Rule, in the model's canonical slug order — never pre-filtered. */
  scenarios: ScenarioNode[];
}

/** One feature's Rules, resolved via `sysreqsOf` — the RTM's outer grouping level. */
interface FeatureGroup {
  feature: FeatureNode;
  /** Every Rule whose `feature` is this feature — never pre-filtered. */
  ruleGroups: RuleGroup[];
}

/** Project the model into the Feature → Rule → Scenario grouping the matrix renders (pure, no filtering). */
function buildFeatureGroups(model: TraceModel): FeatureGroup[] {
  return model.features.map((feature) => ({
    feature,
    ruleGroups: sysreqsOf(model, feature.slug).map((rule) => ({
      rule,
      scenarios: scenariosOf(model, rule.slug),
    })),
  }));
}

/** Legend/toolbar order for the four proof states — matches `PROOF_LABEL`'s own key order. */
const PROOF_ORDER: readonly ScenarioProof[] = ['pass', 'fail', 'skip', 'unproven'];

/** Immutable toggle: returns a NEW set with `value` flipped in or out of `set`. */
function toggled(set: ReadonlySet<string>, value: string): ReadonlySet<string> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

/** A Rule's scenarios to actually render, given the untested-only filter. */
function visibleScenariosOf(ruleGroup: RuleGroup, untestedOnly: boolean): ScenarioNode[] {
  return untestedOnly
    ? ruleGroup.scenarios.filter((s) => s.proof === 'unproven')
    : ruleGroup.scenarios;
}

/**
 * Whether a Rule stays on the matrix under the current filter. An EMPTY Rule
 * (spec §4.7: no scenarios at all — "a requirement with no proof") is a
 * structural diagnostic, not a scenario-status fact, so it is ALWAYS kept —
 * the untested-only filter must never make a coverage gap disappear.
 */
function ruleIsVisible(ruleGroup: RuleGroup, untestedOnly: boolean): boolean {
  if (!untestedOnly) return true;
  if (ruleGroup.rule.empty) return true;
  return visibleScenariosOf(ruleGroup, untestedOnly).length > 0;
}

/** Whether a feature stays on the matrix — an uncovered feature (zero Rules) is likewise always kept. */
function featureIsVisible(featureGroup: FeatureGroup, untestedOnly: boolean): boolean {
  if (!untestedOnly) return true;
  if (featureGroup.ruleGroups.length === 0) return true;
  return featureGroup.ruleGroups.some((rg) => ruleIsVisible(rg, untestedOnly));
}

/** The requirements-traceability matrix: scenario rows grouped by Rule → Feature (spec §5). */
export function MatrixView(props: MatrixViewProps): ReactElement {
  const { model, theme, className } = props;
  const [closedFeatures, setClosedFeatures] = useState<ReadonlySet<string>>(new Set());
  const [closedRules, setClosedRules] = useState<ReadonlySet<string>>(new Set());
  const [untestedOnly, setUntestedOnly] = useState(false);

  const featureGroups = useMemo(() => buildFeatureGroups(model), [model]);
  const untestedTotal = useMemo(
    () => tallyProofs(model.scenarios.map((s) => s.proof)).unproven,
    [model.scenarios],
  );

  if (model.features.length === 0) {
    return (
      <TraceThemedRoot theme={theme} className={className}>
        <div className="trace-matrix">
          <div className="trace-chain-empty">No features in this tree yet.</div>
        </div>
      </TraceThemedRoot>
    );
  }

  const visibleFeatureGroups = featureGroups.filter((fg) => featureIsVisible(fg, untestedOnly));

  return (
    <TraceThemedRoot theme={theme} className={className}>
      <div className="trace-matrix">
        <div className="trace-matrix-toolbar">
          <button
            type="button"
            className={`trace-filter-chip${untestedOnly ? ' trace-filter-chip--active' : ''}`}
            onClick={() => setUntestedOnly((v) => !v)}
          >
            {`Untested only · ${untestedTotal}`}
          </button>
          <span className="trace-matrix-legend">
            {PROOF_ORDER.map((proof) => (
              <span className="trace-matrix-legend-item" key={proof}>
                <span
                  className="trace-proof-dot"
                  style={{ '--chip-accent': PROOF_ACCENT[proof] } as CSSProperties}
                />
                {PROOF_LABEL[proof]}
              </span>
            ))}
          </span>
          <span className="trace-matrix-hint">
            export via the CLI · <code>workspec-trace matrix --out matrix.md</code>
          </span>
        </div>

        {visibleFeatureGroups.length === 0 && (
          <div className="trace-explorer-empty">No scenarios match this filter.</div>
        )}

        {visibleFeatureGroups.map((fg) => (
          <MatrixFeatureRow
            key={fg.feature.slug}
            group={fg}
            open={!closedFeatures.has(fg.feature.slug)}
            onToggle={() => setClosedFeatures((prev) => toggled(prev, fg.feature.slug))}
            untestedOnly={untestedOnly}
            closedRules={closedRules}
            onToggleRule={(slug) => setClosedRules((prev) => toggled(prev, slug))}
          />
        ))}
      </div>
    </TraceThemedRoot>
  );
}

/** One feature's row: its Rules (or the explicit "uncovered" case), collapsible. */
function MatrixFeatureRow(props: {
  group: FeatureGroup;
  open: boolean;
  onToggle: () => void;
  untestedOnly: boolean;
  closedRules: ReadonlySet<string>;
  onToggleRule: (slug: string) => void;
}): ReactElement {
  const { group, open, onToggle, untestedOnly, closedRules, onToggleRule } = props;
  const uncovered = group.ruleGroups.length === 0;
  const allScenarios = group.ruleGroups.flatMap((rg) => rg.scenarios);
  const rollup = uncovered ? '—' : formatProofTally(tallyProofs(allScenarios.map((s) => s.proof)));
  const visibleRuleGroups = group.ruleGroups.filter((rg) => ruleIsVisible(rg, untestedOnly));

  return (
    <div className="trace-matrix-feature">
      <div
        className="trace-matrix-feature-header"
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
        <span className="trace-matrix-feature-name">{group.feature.name}</span>
        <span className="trace-matrix-feature-slug">{group.feature.slug}</span>
        <span className="trace-matrix-rollup">{rollup}</span>
      </div>

      {open &&
        (uncovered ? (
          <div className="trace-matrix-nested-empty">
            <div className="trace-chain-empty trace-chain-empty--warn">
              This feature has no system requirements yet — it is uncovered.
            </div>
          </div>
        ) : (
          <div className="trace-matrix-rules">
            {visibleRuleGroups.map((rg) => (
              <MatrixRuleRow
                key={rg.rule.slug}
                ruleGroup={rg}
                open={!closedRules.has(rg.rule.slug)}
                onToggle={() => onToggleRule(rg.rule.slug)}
                untestedOnly={untestedOnly}
              />
            ))}
          </div>
        ))}
    </div>
  );
}

/** One Rule's row: its scenarios (or the explicit "no scenarios yet" case), collapsible. */
function MatrixRuleRow(props: {
  ruleGroup: RuleGroup;
  open: boolean;
  onToggle: () => void;
  untestedOnly: boolean;
}): ReactElement {
  const { ruleGroup, open, onToggle, untestedOnly } = props;
  const { rule, scenarios } = ruleGroup;
  const rollup = rule.empty ? '—' : formatProofTally(tallyProofs(scenarios.map((s) => s.proof)));
  const visibleScenarios = visibleScenariosOf(ruleGroup, untestedOnly);

  return (
    <div className="trace-matrix-rule">
      <div
        className="trace-matrix-rule-header"
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
        <span className="trace-matrix-chevron trace-matrix-chevron--rule">{open ? '▾' : '▸'}</span>
        <span className="trace-matrix-rule-title">{rule.title}</span>
        <span className="trace-matrix-rule-slug">{rule.slug}</span>
        <span className="trace-matrix-rollup">{rollup}</span>
      </div>

      {open &&
        (rule.empty ? (
          <div className="trace-matrix-nested-empty">
            <div className="trace-chain-empty trace-chain-empty--warn">
              This Rule has no scenarios yet — a requirement with no proof.
            </div>
          </div>
        ) : (
          <div className="trace-matrix-scenarios">
            {visibleScenarios.map((scenario) => (
              <div className="trace-chain-scenario-row" key={scenario.slug}>
                <span
                  className="trace-proof-dot"
                  style={{ '--chip-accent': PROOF_ACCENT[scenario.proof] } as CSSProperties}
                />
                <span className="trace-chain-scenario-slug">{scenario.slug}</span>
                <span className="trace-chain-scenario-title">{scenario.title}</span>
                <span
                  className="trace-pill"
                  style={{ '--chip-accent': PROOF_ACCENT[scenario.proof] } as CSSProperties}
                >
                  {PROOF_LABEL[scenario.proof]}
                </span>
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}
