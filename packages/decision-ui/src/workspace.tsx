// The Decision Workspace view. `DecisionWorkspace` is the container: it loads the
// decision and its catalog through the port (TanStack Query) and hands them to
// `WorkspaceView`, which owns a local editable draft so lever toggles and line
// edits reprice instantly via the engine, then persists each change through the
// write mutation. The decision header, links row, and the grid of option cards
// (with cheapest + recommended badges) are faithful to the prototype Workspace.

import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { compute, recommend } from '@workspec/decision-engine';
import type { Catalog, Decision, Ref } from '@workspec/decision-schema';
import {
  useCapabilities,
  useDecision,
  useCatalog,
  useLinkResolver,
  useNavigate,
  useWriteDecision,
} from './context.js';
import {
  setLineAmount,
  setLineField,
  setLineQty,
  setScore,
  toggleLever,
  toggleOptionEnv,
} from './edits.js';
import { Button, Lbl } from '@workspec/design/components';
import { resolveCatalogRef } from './host.js';
import { LinksBlock } from './links.js';
import { OptionCard } from './option-card.js';
import { Icon } from './primitives.js';

/** Props for {@link DecisionWorkspace}. */
export interface DecisionWorkspaceProps {
  /** The ref of the decision to render (opaque to the UI). */
  decisionRef: Ref;
}

function Notice(props: { tone: 'muted' | 'error'; children: ReactElement | string }): ReactElement {
  return (
    <div className={props.tone === 'error' ? 'ds-notice ds-notice-error' : 'ds-notice'}>
      {props.children}
    </div>
  );
}

/**
 * Load a decision + its catalog and render the workspace. Remounts (via `key`)
 * when the decision ref changes so a fresh editing draft is seeded.
 */
export function DecisionWorkspace(props: DecisionWorkspaceProps): ReactElement {
  const { decisionRef } = props;
  const decisionQuery = useDecision(decisionRef);
  const decision = decisionQuery.data;
  const catalogRef = decision !== undefined ? resolveCatalogRef(decisionRef, decision) : undefined;
  const catalogQuery = useCatalog(catalogRef);

  if (decisionQuery.isPending) return <Notice tone="muted">Loading decision…</Notice>;
  if (decisionQuery.isError) {
    return (
      <Notice tone="error">{`Could not load decision: ${decisionQuery.error.message}`}</Notice>
    );
  }
  if (decision === undefined) return <Notice tone="error">Decision not found.</Notice>;
  if (catalogQuery.isPending) return <Notice tone="muted">Loading catalog…</Notice>;
  if (catalogQuery.isError) {
    return <Notice tone="error">{`Could not load catalog: ${catalogQuery.error.message}`}</Notice>;
  }
  const catalog = catalogQuery.data;
  if (catalog === undefined) return <Notice tone="error">Catalog not found.</Notice>;

  return (
    <WorkspaceView
      key={decisionRef}
      decisionRef={decisionRef}
      initialDecision={decision}
      catalog={catalog}
    />
  );
}

function WorkspaceView(props: {
  decisionRef: Ref;
  initialDecision: Decision;
  catalog: Catalog;
}): ReactElement {
  const { decisionRef, initialDecision, catalog } = props;
  const [draft, setDraft] = useState<Decision>(initialDecision);
  const [openId, setOpenId] = useState<string | null>(initialDecision.spec.options[0]?.id ?? null);

  const resolveLink = useLinkResolver();
  const navigate = useNavigate();
  const capabilities = useCapabilities();
  const writeDecision = useWriteDecision();

  const commit = (next: Decision): void => {
    setDraft(next);
    writeDecision.mutate({ ref: decisionRef, decision: next });
  };

  const result = useMemo(() => compute(draft, catalog), [draft, catalog]);
  const recommendedId = useMemo(() => recommend(result, draft), [result, draft]);
  const cheapestId = result.cheapestId;

  const decided = draft.metadata.status === 'decided';
  const options = draft.spec.options;

  return (
    <div className="ds-wrap">
      <div className="ds-dechead">
        <div className="ds-dechead-meta">
          <Lbl>{`Decision · ${draft.metadata.id}`}</Lbl>
          <h1 className="ds-dechead-title">{draft.metadata.title}</h1>
          <p className="ds-ctx">{draft.spec.context}</p>
          <LinksBlock links={draft.spec.links ?? []} resolve={resolveLink} />
        </div>
        <div className="ds-actions">
          <span className={`ds-status ds-status-${draft.metadata.status}`}>
            <span className="ds-status-dot" aria-hidden="true" />
            {decided ? 'Decided' : 'Exploring'}
          </span>
          {navigate !== undefined && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate({ kind: 'view', label: 'Compare', target: 'compare' })}
              >
                <Icon.scale /> Compare
              </Button>
              <Button
                size="sm"
                onClick={() => navigate({ kind: 'view', label: 'ADR', target: 'adr' })}
              >
                <Icon.doc /> {capabilities.decide ? 'Decide' : 'View ADR'}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="ds-sectlabel">
        <h2>Options</h2>
        <span className="ds-ln" />
        <span className="ds-ct">{`${options.length} candidate${options.length === 1 ? '' : 's'}`}</span>
      </div>

      <div className="ds-optgrid">
        {options.map((option) => {
          const cost = result.byOption[option.id];
          if (cost === undefined) return null;
          return (
            <OptionCard
              key={option.id}
              option={option}
              decision={draft}
              catalog={catalog}
              criteria={draft.spec.criteria}
              cost={cost}
              open={openId === option.id}
              onToggle={() => setOpenId(openId === option.id ? null : option.id)}
              cheapest={cheapestId === option.id}
              recommended={recommendedId === option.id}
              onToggleLever={(leverId) => commit(toggleLever(draft, option.id, leverId))}
              onLineField={(lineId, patch) => commit(setLineField(draft, option.id, lineId, patch))}
              onLineQty={(lineId, env, qty) =>
                commit(setLineQty(draft, option.id, lineId, env, qty))
              }
              onLineAmount={(lineId, env, amount) =>
                commit(setLineAmount(draft, option.id, lineId, env, amount))
              }
              onToggleEnv={(env) => commit(toggleOptionEnv(draft, option.id, env))}
              onScore={(criterionId, score) =>
                commit(setScore(draft, option.id, criterionId, score))
              }
            />
          );
        })}
      </div>
    </div>
  );
}
