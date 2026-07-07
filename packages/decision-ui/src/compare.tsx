// The Compare view. A column per option, rows for per-env monthly cost, annual
// (with the delta vs the cheapest floor and a proportional bar), the criteria
// score matrix, and a "select winner" pick row. A recommendation banner
// summarises the engine's deterministic `recommend()` — cheapest name + annual,
// the recommended option, and its premium over the floor. No LLM prose (P7):
// every number and the pick come straight from `@workspec/decision-engine`.
// Winner-selected columns highlight; rejected columns dim.

import { useMemo } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import { compute, recommend } from '@workspec/decision-engine';
import type { DecisionCostResult } from '@workspec/decision-engine';
import type { Catalog, Decision, Ref } from '@workspec/decision-schema';
import {
  useCapabilities,
  useCatalog,
  useDecision,
  useNavigate,
  useWriteDecision,
} from './context.js';
import { decide, reopen, suggestRationale } from './decide.js';
import { resolveCatalogRef } from './host.js';
import { money } from './format.js';
import { Dots, Flag, Icon, optAccent } from './primitives.js';

/** Props for {@link DecisionCompare}. */
export interface DecisionCompareProps {
  /** The ref of the decision to compare. */
  decisionRef: Ref;
  /** Show the criteria score-matrix rows (default true). */
  showCriteria?: boolean;
}

function Notice(props: { tone: 'muted' | 'error'; children: string }): ReactElement {
  return (
    <div className={props.tone === 'error' ? 'ds-notice ds-notice-error' : 'ds-notice'}>
      {props.children}
    </div>
  );
}

function titleCase(env: string): string {
  return env.length === 0 ? env : env[0]!.toUpperCase() + env.slice(1);
}

/** Load a decision + its catalog and render the side-by-side comparison. */
export function DecisionCompare(props: DecisionCompareProps): ReactElement {
  const { decisionRef, showCriteria = true } = props;
  const decisionQuery = useDecision(decisionRef);
  const decision = decisionQuery.data;
  const catalogRef = decision !== undefined ? resolveCatalogRef(decisionRef, decision) : undefined;
  const catalogQuery = useCatalog(catalogRef);

  if (decisionQuery.isPending) return <Notice tone="muted">Loading decision…</Notice>;
  if (decisionQuery.isError)
    return (
      <Notice tone="error">{`Could not load decision: ${decisionQuery.error.message}`}</Notice>
    );
  if (decision === undefined) return <Notice tone="error">Decision not found.</Notice>;
  if (catalogQuery.isPending) return <Notice tone="muted">Loading catalog…</Notice>;
  if (catalogQuery.isError)
    return <Notice tone="error">{`Could not load catalog: ${catalogQuery.error.message}`}</Notice>;
  const catalog = catalogQuery.data;
  if (catalog === undefined) return <Notice tone="error">Catalog not found.</Notice>;

  return (
    <CompareView
      decisionRef={decisionRef}
      catalogRef={catalogRef as Ref}
      decision={decision}
      catalog={catalog}
      showCriteria={showCriteria}
    />
  );
}

function CompareView(props: {
  decisionRef: Ref;
  catalogRef: Ref;
  decision: Decision;
  catalog: Catalog;
  showCriteria: boolean;
}): ReactElement {
  const { decisionRef, decision, catalog, showCriteria } = props;
  const navigate = useNavigate();
  const capabilities = useCapabilities();
  const writeDecision = useWriteDecision();

  const result: DecisionCostResult = useMemo(() => compute(decision, catalog), [decision, catalog]);
  const cheapestId = result.cheapestId;
  const recommendedId = useMemo(() => recommend(result, decision), [result, decision]);

  const options = decision.spec.options;
  const envs = decision.spec.environments;
  const decided = decision.metadata.status === 'decided';
  const winnerId = decision.spec.outcome?.option ?? null;

  const commit = (next: Decision): void => {
    writeDecision.mutate({ ref: decisionRef, decision: next });
  };

  // Annual span across the COMPLETE options only (the incomplete ones have no bar).
  let minAnnual = Infinity;
  let maxAnnual = 0;
  for (const option of options) {
    const cost = result.byOption[option.id];
    if (cost?.complete !== true) continue;
    if (cost.annual < minAnnual) minAnnual = cost.annual;
    if (cost.annual > maxAnnual) maxAnnual = cost.annual;
  }
  const hasFloor = minAnnual !== Infinity;

  const cheapest = options.find((o) => o.id === cheapestId);
  const recommended = options.find((o) => o.id === recommendedId);
  const cheapestAnnual = cheapestId !== null ? (result.byOption[cheapestId]?.annual ?? 0) : 0;
  const recommendedAnnual =
    recommendedId !== null ? (result.byOption[recommendedId]?.annual ?? 0) : 0;
  const premium =
    recommended && cheapest && recommended.id !== cheapest.id
      ? recommendedAnnual - cheapestAnnual
      : 0;

  const verdictOf = (id: string): 'selected' | 'rejected' | null => {
    if (!decided || winnerId === null) return null;
    return winnerId === id ? 'selected' : 'rejected';
  };
  const cellClass = (id: string): string => {
    const verdict = verdictOf(id);
    return `ds-cell${verdict === 'selected' ? ' ds-cell-win' : ''}${
      verdict === 'rejected' ? ' ds-cell-dim' : ''
    }`;
  };

  return (
    <div className="ds-wrap ds-wide">
      <div className="ds-dechead" style={{ marginBottom: 14 }}>
        <div className="ds-dechead-meta">
          <div className="ds-eyebrow">
            Compare · like-for-like · same workloads on each platform
          </div>
          <h1 className="ds-dechead-title" style={{ fontSize: 22 }}>
            {decision.metadata.title}
          </h1>
        </div>
        <div className="ds-actions">
          <span className={`ds-status ds-status-${decision.metadata.status}`}>
            <span className="ds-status-dot" aria-hidden="true" />
            {decided ? 'Decided' : 'Exploring'}
          </span>
          {navigate !== undefined && (
            <button
              type="button"
              className="ds-btn ds-btn-sm"
              onClick={() => navigate({ kind: 'view', label: 'Options', target: 'options' })}
            >
              ← Back to options
            </button>
          )}
        </div>
      </div>

      {recommended && (
        <div className="ds-recobanner" role="note">
          <div className="ds-reco-face" aria-hidden="true">
            <span className="ds-reco-pulse" />
          </div>
          <div className="ds-reco-txt">
            <div className="ds-reco-who">Recommendation · engine-derived</div>
            <div className="ds-reco-body">
              On a like-for-like basis,{' '}
              <b className="ds-reco-em">{cheapest ? cheapest.name : '—'}</b> is the cheapest at{' '}
              <b>{money(cheapestAnnual)}/yr</b>
              {premium > 0 ? (
                <>
                  , but <b className="ds-reco-em">{recommended.name}</b> is the recommended option —
                  the strongest weighted fit across the criteria — for a <b>{money(premium)}/yr</b>{' '}
                  premium over the floor. Reserving steady prod narrows the gap.
                </>
              ) : (
                <> and also the strongest weighted fit, so it is both cheapest and recommended.</>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="ds-compare">
        <table className="ds-ctbl">
          <colgroup>
            <col className="ds-metric-col" />
            {options.map((o) => (
              <col key={o.id} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="ds-metrichead" scope="col">
                <span className="ds-vh">Metric</span>
              </th>
              {options.map((o) => {
                const cost = result.byOption[o.id];
                const verdict = verdictOf(o.id);
                return (
                  <th className="ds-opthead" key={o.id} scope="col">
                    <div
                      className={`ds-opthcard${verdict === 'selected' ? ' ds-win' : ''}${
                        verdict === 'rejected' ? ' ds-dim' : ''
                      }`}
                      style={{ '--ds-opt-accent': optAccent(o.id) } as CSSProperties}
                    >
                      {o.archetype !== undefined && <div className="ds-oh-arch">{o.archetype}</div>}
                      <div className="ds-oh-nm">{o.name}</div>
                      <div className="ds-oh-flags">
                        {cheapestId === o.id && <Flag tone="accent">Cheapest</Flag>}
                        {recommendedId === o.id && (
                          <Flag tone="agent">
                            <Icon.spark className="ds-flag-icon" /> Recommended
                          </Flag>
                        )}
                        {cost?.complete !== true && <Flag tone="warn">Modelling</Flag>}
                        {verdict === 'selected' && (
                          <Flag tone="accent">
                            <Icon.check className="ds-flag-icon" /> Chosen
                          </Flag>
                        )}
                      </div>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            <tr className="ds-section">
              <td className="ds-metric">Cost / month</td>
              {options.map((o) => (
                <td key={o.id} className="ds-cell" />
              ))}
            </tr>
            {envs.map((env) => (
              <tr key={env}>
                <th scope="row" className="ds-metric">
                  <div className="ds-ml">{titleCase(env)}</div>
                </th>
                {options.map((o) => {
                  const cost = result.byOption[o.id];
                  const active = o.environments.includes(env);
                  return (
                    <td key={o.id} className={cellClass(o.id)}>
                      {active && cost?.complete === true ? (
                        <span className="ds-cellcost ds-tnum">{money(cost.perEnv[env] ?? 0)}</span>
                      ) : (
                        <span className="ds-cell-na">{active ? '…' : 'n/a'}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}

            <tr>
              <th scope="row" className="ds-metric">
                <div className="ds-ml">Annual · all envs</div>
                <div className="ds-mh">total run-rate</div>
              </th>
              {options.map((o) => {
                const cost = result.byOption[o.id];
                if (cost?.complete !== true) {
                  return (
                    <td key={o.id} className={cellClass(o.id)}>
                      <span className="ds-cell-na">model incomplete</span>
                    </td>
                  );
                }
                const delta = hasFloor ? cost.annual - minAnnual : 0;
                const width = maxAnnual > 0 ? Math.max(8, (cost.annual / maxAnnual) * 100) : 8;
                return (
                  <td key={o.id} className={cellClass(o.id)}>
                    <span className="ds-cellcost ds-cell-annual ds-tnum">{money(cost.annual)}</span>
                    <div className={`ds-celldelta ${delta === 0 ? 'ds-best' : 'ds-up'}`}>
                      {delta === 0 ? '▼ floor' : `+${money(delta)}/yr`}
                    </div>
                    <div
                      className="ds-barwrap"
                      style={{ '--ds-opt-accent': optAccent(o.id) } as CSSProperties}
                    >
                      <div className="ds-bar-fill" style={{ width: `${width}%` }} />
                    </div>
                  </td>
                );
              })}
            </tr>

            {showCriteria && (
              <tr className="ds-section">
                <td className="ds-metric">Criteria</td>
                {options.map((o) => (
                  <td key={o.id} className="ds-cell" />
                ))}
              </tr>
            )}
            {showCriteria &&
              decision.spec.criteria.map((criterion) => (
                <tr key={criterion.id}>
                  <th scope="row" className="ds-metric">
                    <div className="ds-ml" title={criterion.hint}>
                      {criterion.label}
                    </div>
                  </th>
                  {options.map((o) => {
                    const scored = o.scores[criterion.id];
                    return (
                      <td key={o.id} className={cellClass(o.id)}>
                        <Dots value={scored?.score ?? 0} accentless />
                        {scored?.note !== undefined && (
                          <div className="ds-cellnote">{scored.note}</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}

            {capabilities.decide && (
              <tr>
                <th scope="row" className="ds-metric">
                  <div className="ds-ml">The choice</div>
                  <div className="ds-mh">selecting records the outcome</div>
                </th>
                {options.map((o) => {
                  const cost = result.byOption[o.id];
                  const verdict = verdictOf(o.id);
                  return (
                    <td key={o.id} className="ds-cell ds-pickrow">
                      {verdict === 'selected' ? (
                        <button
                          type="button"
                          className="ds-btn ds-btn-sm ds-btn-win ds-btn-block"
                          onClick={() => commit(reopen(decision))}
                        >
                          <Icon.check className="ds-btn-icon" /> Chosen · reopen
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="ds-btn ds-btn-sm ds-btn-block"
                          disabled={cost?.complete !== true}
                          onClick={() =>
                            commit(decide(decision, o.id, suggestRationale(decision, o.id)))
                          }
                        >
                          {`Select ${o.name}`}
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {decided && navigate !== undefined && (
        <div className="ds-compare-foot">
          <button
            type="button"
            className="ds-btn ds-btn-primary"
            onClick={() => navigate({ kind: 'view', label: 'ADR', target: 'adr' })}
          >
            <Icon.doc className="ds-btn-icon" /> Open the ADR
          </button>
        </div>
      )}
    </div>
  );
}
