// DecisionCard — a compact, read-only summary of a decision for embedding in a
// WorkSpec board (or any host surface that wants a costed decision at a glance).
//
// It shows the decision title, its lifecycle status, and one headline option:
// the chosen option once the decision is decided, otherwise the engine's
// recommended option while it is still exploring — with that option's annual
// cost. Every number comes from the SAME engine the workspace and ADR use
// (`compute` for the costs, `recommend` for the exploring pick) and the SAME
// deterministic money formatter, so a card, the workspace, and the CLI's ADR
// never disagree. Read-only: no editing, no levers, no port writes.
//
// Styling is `--ds-*` only; the card renders inside a `DecisionStudioProvider`.

import { useMemo } from 'react';
import type { ReactElement } from 'react';
import { compute, recommend } from '@workspec/decision-engine';
import type { Catalog, Decision, Ref } from '@workspec/decision-schema';
import { useCatalog, useDecision } from './context.js';
import { resolveCatalogRef } from './host.js';
import { money } from './format.js';

/** Props for {@link DecisionCard}. */
export interface DecisionCardProps {
  /** The ref of the decision to summarise (opaque to the UI). */
  decisionRef: Ref;
}

function CardShell(props: {
  tone?: 'muted' | 'error';
  children: ReactElement | string;
}): ReactElement {
  const cls =
    props.tone === 'error'
      ? 'ds-card ds-card-msg ds-card-error'
      : props.tone === 'muted'
        ? 'ds-card ds-card-msg ds-muted'
        : 'ds-card';
  return <div className={cls}>{props.children}</div>;
}

/** Load a decision + its catalog and render the compact summary card. */
export function DecisionCard(props: DecisionCardProps): ReactElement {
  const { decisionRef } = props;
  const decisionQuery = useDecision(decisionRef);
  const decision = decisionQuery.data;
  const catalogRef = decision !== undefined ? resolveCatalogRef(decisionRef, decision) : undefined;
  const catalogQuery = useCatalog(catalogRef);

  if (decisionQuery.isPending) return <CardShell tone="muted">Loading…</CardShell>;
  if (decisionQuery.isError)
    return (
      <CardShell tone="error">{`Could not load decision: ${decisionQuery.error.message}`}</CardShell>
    );
  if (decision === undefined) return <CardShell tone="error">Decision not found.</CardShell>;
  if (catalogQuery.isPending) return <CardShell tone="muted">Loading…</CardShell>;
  if (catalogQuery.isError)
    return (
      <CardShell tone="error">{`Could not load catalog: ${catalogQuery.error.message}`}</CardShell>
    );
  const catalog = catalogQuery.data;
  if (catalog === undefined) return <CardShell tone="error">Catalog not found.</CardShell>;

  return <CardView decision={decision} catalog={catalog} />;
}

function CardView(props: { decision: Decision; catalog: Catalog }): ReactElement {
  const { decision, catalog } = props;
  const result = useMemo(() => compute(decision, catalog), [decision, catalog]);

  const status = decision.metadata.status;
  const decided = status === 'decided';
  const superseded = status === 'superseded';
  const outcome = decision.spec.outcome;

  // Decided → the recorded winner; otherwise the engine's recommended option.
  const featuredId =
    decided && outcome !== undefined ? outcome.option : recommend(result, decision);
  const featured =
    featuredId !== null ? decision.spec.options.find((o) => o.id === featuredId) : undefined;
  const cost = featuredId !== null ? result.byOption[featuredId] : undefined;
  const hasChoice = featured !== undefined && cost !== undefined && cost.complete;

  const statusLabel = decided ? 'Decided' : superseded ? 'Superseded' : 'Exploring';
  const statusClass = decided ? 'decided' : superseded ? 'superseded' : 'exploring';
  const choiceLabel = decided ? 'Chosen' : 'Recommended';

  return (
    <div className="ds-card">
      <div className="ds-card-head">
        <span className="ds-eyebrow">{`Decision · ${decision.metadata.id}`}</span>
        <span className={`ds-status ds-status-${statusClass}`}>
          <span className="ds-status-dot" aria-hidden="true" />
          {statusLabel}
        </span>
      </div>

      <h3 className="ds-card-title">{decision.metadata.title}</h3>

      {hasChoice ? (
        <div className="ds-card-choice">
          <div className="ds-card-choice-main">
            <span className="ds-card-choice-lab">{choiceLabel}</span>
            <span className="ds-card-choice-nm">{featured.name}</span>
          </div>
          <div className="ds-card-cost ds-tnum">
            <span className="ds-card-cost-v">{money(cost.annual)}</span>
            <span className="ds-card-cost-per">per year</span>
          </div>
        </div>
      ) : (
        <div className="ds-card-choice ds-card-choice-empty">
          <span className="ds-card-choice-lab ds-muted">No option modelled yet</span>
        </div>
      )}
    </div>
  );
}
