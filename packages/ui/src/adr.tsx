// The ADR view. Rendered from the engine's `buildAdrModel(decision, catalog)` —
// the SAME model the studio CLI's `render-adr` serialises to Markdown, so the
// in-app record and the generated `*.adr.md` never drift (one model, two
// consumers). The document (context, considered options with per-env/annual
// numbers, decision, consequences, links) is a pure transform, shown
// immediately — no Atlas generation sequence (porting decision P7).
//
// The "Decide" action (gated on `capabilities.decide`) selects the winner,
// captures the "we accept X in exchange for Y" rationale, sets `status: decided`,
// stamps `spec.outcome`, and writes through the port. Reopen returns to
// exploring. A superseded decision renders read-only with a pointer to the
// decision that superseded it.

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { buildAdrModel } from '@workspec/decision-engine';
import type { AdrModel } from '@workspec/decision-engine';
import type { Catalog, Decision, Ref } from '@workspec/decision-schema';
import {
  useCapabilities,
  useCatalog,
  useDecision,
  useNavigate,
  useRepository,
  useWriteDecision,
} from './context.js';
import { decide, reopen, setRationale, suggestRationale } from './decide.js';
import { repositoryId, resolveCatalogRef } from './host.js';
import { money } from './format.js';
import { Icon } from './primitives.js';

/** Props for {@link DecisionAdr}. */
export interface DecisionAdrProps {
  /** The ref of the decision to render as an ADR. */
  decisionRef: Ref;
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

/** Load a decision + its catalog and render the ADR. */
export function DecisionAdr(props: DecisionAdrProps): ReactElement {
  const { decisionRef } = props;
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
    <AdrView key={decisionRef} decisionRef={decisionRef} decision={decision} catalog={catalog} />
  );
}

/**
 * Inline editor for an already-decided rationale. Seeded from `initial` and
 * re-seeded (via `key` at the call site) whenever the persisted rationale
 * changes, so a fresh decide never leaves stale text behind. Commits on blur,
 * only when non-empty and actually changed.
 */
function RationaleEditor(props: {
  initial: string;
  onCommit: (rationale: string) => void;
}): ReactElement {
  const [value, setValue] = useState(props.initial);
  return (
    <textarea
      className="ds-adr-rationale"
      aria-label="Decision rationale"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        const trimmed = value.trim();
        if (trimmed.length > 0 && trimmed !== props.initial) props.onCommit(value);
      }}
    />
  );
}

/**
 * Best-effort resolver for the decision that supersedes `decisionId` — the one
 * whose `metadata.supersedes` names it. Only runs for a superseded decision
 * (`enabled`), so the common path never scans the repository.
 */
function useSupersededBy(
  decisionId: string,
  enabled: boolean,
): { ref: Ref; id: string; title?: string } | null {
  const repository = useRepository();
  const query = useQuery({
    queryKey: ['ds', 'supersededBy', repositoryId(repository), decisionId],
    enabled,
    queryFn: async () => {
      const refs = await repository.listDecisions();
      for (const entry of refs) {
        const other = await repository.readDecision(entry.ref);
        if (other.metadata.supersedes === decisionId) {
          return {
            ref: entry.ref,
            id: other.metadata.id,
            ...(other.metadata.title !== undefined ? { title: other.metadata.title } : {}),
          };
        }
      }
      return null;
    },
  });
  return query.data ?? null;
}

function AdrView(props: { decisionRef: Ref; decision: Decision; catalog: Catalog }): ReactElement {
  const { decisionRef, decision, catalog } = props;
  const capabilities = useCapabilities();
  const navigate = useNavigate();
  const writeDecision = useWriteDecision();

  const model: AdrModel = useMemo(() => buildAdrModel(decision, catalog), [decision, catalog]);

  const decided = decision.metadata.status === 'decided';
  const superseded = decision.metadata.status === 'superseded';
  const canDecide = capabilities.decide && !superseded;

  const supersededBy = useSupersededBy(decision.metadata.id, superseded);

  // Decide form state — seeded from the engine's recommended winner.
  const [winner, setWinner] = useState<string>(
    () => model.decision.optionId ?? decision.spec.options[0]?.id ?? '',
  );
  const [rationale, setRationale_] = useState<string>(() =>
    suggestRationale(decision, model.decision.optionId ?? decision.spec.options[0]?.id ?? ''),
  );

  const commit = (next: Decision): void => {
    writeDecision.mutate({ ref: decisionRef, decision: next });
  };

  const onSelectWinner = (id: string): void => {
    setWinner(id);
    setRationale_(suggestRationale(decision, id));
  };

  const onDecide = (): void => {
    if (winner === '') return;
    const decidedAt = new Date().toISOString().slice(0, 10);
    const decidedBy = decision.metadata.deciders?.[0];
    commit(decide(decision, winner, rationale, { decidedBy, decidedAt }));
  };

  const statusWord =
    model.status === 'Accepted'
      ? 'Accepted'
      : model.status === 'Superseded'
        ? 'Superseded'
        : 'Proposed';
  const statusClass = decided ? 'decided' : superseded ? 'superseded' : 'exploring';

  return (
    <div className="ds-wrap ds-wide">
      <div className="ds-dechead" style={{ marginBottom: 16 }}>
        <div className="ds-dechead-meta">
          <div className="ds-eyebrow">Decision record · derived from the cost models</div>
          <h1 className="ds-dechead-title" style={{ fontSize: 22 }}>
            {`ADR · ${model.title}`}
          </h1>
        </div>
        <div className="ds-actions">
          {navigate !== undefined && (
            <button
              type="button"
              className="ds-btn ds-btn-sm"
              onClick={() => navigate({ kind: 'view', label: 'Compare', target: 'compare' })}
            >
              ← Comparison
            </button>
          )}
        </div>
      </div>

      <div className="ds-adr-shell">
        <div className="ds-adr-doc">
          <div className="ds-docmeta">
            <span className="ds-doc-id">{model.id}</span>
            <span className={`ds-status ds-status-${statusClass}`}>
              <span className="ds-status-dot" aria-hidden="true" />
              {statusWord}
            </span>
          </div>
          <h1 className="ds-adr-title">{model.title}</h1>
          <div className="ds-adr-sub">
            <span>{statusWord}</span>
            {model.decidedAt !== undefined && (
              <>
                <span>·</span>
                <span>{model.decidedAt}</span>
              </>
            )}
            {model.decidedBy !== undefined && (
              <>
                <span>·</span>
                <span>{model.decidedBy}</span>
              </>
            )}
            {model.deciders.length > 0 && model.decidedBy === undefined && (
              <>
                <span>·</span>
                <span>{model.deciders.join(', ')}</span>
              </>
            )}
          </div>

          <div className="ds-adr-h">Context</div>
          <p className="ds-adr-p">{model.context}</p>

          <div className="ds-adr-h">Considered options</div>
          <div className="ds-adr-considered">
            {model.consideredOptions.map((option) => (
              <div className={`ds-ac${option.chosen ? ' ds-ac-win' : ''}`} key={option.id}>
                <div className="ds-ac-main">
                  <div className="ds-ac-nm">
                    {option.name}
                    {option.chosen && (
                      <span className="ds-chip ds-chip-accent">
                        {decided ? 'chosen' : 'proposed'}
                      </span>
                    )}
                    {!option.complete && <span className="ds-flag ds-flag-warn">incomplete</span>}
                  </div>
                  {(option.archetype !== undefined || option.summary !== undefined) && (
                    <div className="ds-ac-det">
                      {[option.archetype, option.summary].filter(Boolean).join(' — ')}
                    </div>
                  )}
                  {option.complete && option.activeEnvs.length > 0 && (
                    <div className="ds-ac-envs ds-tnum">
                      {option.activeEnvs.map((env) => (
                        <span key={env} className="ds-ac-env">
                          <span className="ds-ac-envk">{titleCase(env)}</span>
                          {money(option.perEnv[env] ?? 0)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="ds-ac-cost ds-tnum">
                  {option.complete ? money(option.annual) : '—'}
                  <small>{option.complete ? 'per year' : 'no model'}</small>
                </div>
              </div>
            ))}
          </div>

          <div className="ds-adr-h">Decision</div>
          {model.decision.optionId === null ? (
            <p className="ds-adr-p ds-muted">
              No option is complete enough to recommend yet — model an option, then decide.
            </p>
          ) : decided ? (
            canDecide ? (
              <RationaleEditor
                key={model.decision.rationale}
                initial={model.decision.rationale}
                onCommit={(next) => commit(setRationale(decision, next))}
              />
            ) : (
              <p className="ds-adr-p">{model.decision.rationale}</p>
            )
          ) : (
            <p className="ds-adr-p">{model.decision.rationale}</p>
          )}

          <div className="ds-adr-h">Consequences &amp; trade-offs</div>
          {model.consequences.length === 0 ? (
            <p className="ds-adr-p ds-muted">No consequences derived — no option selected yet.</p>
          ) : (
            <ul className="ds-cons">
              {model.consequences.map((consequence, i) => (
                <li
                  key={i}
                  className={
                    consequence.kind === 'strength'
                      ? 'ds-cons-pos'
                      : consequence.kind === 'weakness'
                        ? 'ds-cons-neg'
                        : ''
                  }
                >
                  {consequence.text}
                </li>
              ))}
            </ul>
          )}

          {model.links.length > 0 && (
            <>
              <div className="ds-adr-h">Links</div>
              <div className="ds-adr-links">
                {model.links.map((link, i) => (
                  <span className="ds-adr-lk" key={`${link.kind}:${link.label}:${i}`}>
                    <span className="ds-lk-kind">{link.kind.replace(/-/g, ' ')}</span>
                    {link.label}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="ds-adr-rail">
          {superseded ? (
            <div className="ds-railcard ds-railcard-warn">
              <h4>Superseded</h4>
              <p className="ds-rail-p">
                This decision has been superseded and is read-only.
                {supersededBy !== null && ` See ${supersededBy.title ?? supersededBy.id}.`}
              </p>
              {supersededBy !== null && navigate !== undefined && (
                <button
                  type="button"
                  className="ds-btn ds-btn-sm ds-btn-block"
                  onClick={() =>
                    navigate({
                      kind: 'decision',
                      label: supersededBy.title ?? supersededBy.id,
                      target: supersededBy.ref,
                    })
                  }
                >
                  Open superseding decision →
                </button>
              )}
            </div>
          ) : canDecide && !decided ? (
            <div className="ds-railcard ds-railcard-warn">
              <h4>Not yet decided</h4>
              <p className="ds-rail-p">
                This is a <b>proposed</b> record using the engine&apos;s recommendation. Choose a
                winner and record the outcome to accept it.
              </p>
              <label className="ds-rail-field">
                <span className="ds-rail-lab">Winning option</span>
                <select
                  className="ds-rail-select"
                  aria-label="Winning option"
                  value={winner}
                  onChange={(e) => onSelectWinner(e.target.value)}
                >
                  {model.consideredOptions
                    .filter((o) => o.complete)
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="ds-rail-field">
                <span className="ds-rail-lab">Rationale — we accept X for Y</span>
                <textarea
                  className="ds-rail-textarea"
                  aria-label="Decision rationale"
                  value={rationale}
                  onChange={(e) => setRationale_(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="ds-btn ds-btn-sm ds-btn-primary ds-btn-block"
                disabled={winner === ''}
                onClick={onDecide}
              >
                <Icon.check className="ds-btn-icon" /> Decide
              </button>
            </div>
          ) : decided && canDecide ? (
            <div className="ds-railcard">
              <h4>Decided</h4>
              <p className="ds-rail-p">
                Accepted on the recorded outcome. Every number traces to a cost model; edit the
                rationale inline. Reopen to explore again.
              </p>
              <button
                type="button"
                className="ds-btn ds-btn-sm ds-btn-block"
                onClick={() => commit(reopen(decision))}
              >
                <Icon.undo className="ds-btn-icon" /> Reopen decision
              </button>
            </div>
          ) : (
            <div className="ds-railcard">
              <h4>Read-only</h4>
              <p className="ds-rail-p">
                This host has not granted the decide capability. The record is derived from the cost
                models and shown for review.
              </p>
            </div>
          )}

          <div className="ds-railcard">
            <h4>How this is built</h4>
            <p className="ds-rail-p">
              Rendered from the same deterministic model the CLI&apos;s <code>render-adr</code>{' '}
              serialises to <code>*.adr.md</code> — the file and this view never diverge.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
