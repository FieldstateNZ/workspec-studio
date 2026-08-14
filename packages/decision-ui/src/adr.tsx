import type { ReactElement, ReactNode } from 'react';
import type { Decision, Ref } from '@workspec/decision-schema';
import { Card, Lbl } from '@workspec/design/components';
import { useDecision } from './context.js';
import { decisionSlug } from './host.js';

export interface DecisionAdrProps {
  decisionRef: Ref;
  action?: ReactNode;
}

function Notice(props: { error?: boolean; children: string }): ReactElement {
  return (
    <div className={props.error ? 'ds-notice ds-notice-error' : 'ds-notice'}>{props.children}</div>
  );
}

function Section(props: { title: string; children?: ReactNode }): ReactElement | null {
  if (props.children === undefined || props.children === null) return null;
  return (
    <section className="ds-core-adr-section">
      <h2>{props.title}</h2>
      {props.children}
    </section>
  );
}

export function DecisionAdr(props: DecisionAdrProps): ReactElement {
  const query = useDecision(props.decisionRef);
  if (query.isPending) return <Notice>Loading decision…</Notice>;
  if (query.isError)
    return <Notice error>{`Could not load decision: ${query.error.message}`}</Notice>;
  if (query.data === undefined) return <Notice error>Decision not found.</Notice>;
  return (
    <>
      <div className="ds-app-toolbar">
        <span className="ds-app-toolbar-label">View</span>
        <div className="ds-app-toolbar-actions">{props.action}</div>
      </div>
      <AdrView decisionRef={props.decisionRef} decision={query.data} />
    </>
  );
}

export function AdrView(props: { decisionRef: Ref; decision: Decision }): ReactElement {
  const { spec } = props.decision;
  return (
    <div className="ds-wrap ds-wide">
      <Card className="ds-core-adr">
        <header className="ds-core-adr-header">
          <Lbl>{`ADR · ${decisionSlug(props.decision, props.decisionRef)}`}</Lbl>
          <h1>{spec.title}</h1>
          <div className="ds-core-adr-meta">
            <span className={`ds-core-status ds-core-status-${spec.status}`}>{spec.status}</span>
            {spec.created && <span>Created {spec.created}</span>}
            {spec.decided && <span>Decided {spec.decided}</span>}
            {spec.deciders?.length ? <span>{`Deciders: ${spec.deciders.join(', ')}`}</span> : null}
          </div>
        </header>

        <Section title="Context">
          <p>{spec.context}</p>
        </Section>
        <Section title="Decision">
          <p>{spec.decision}</p>
        </Section>
        {spec.rationale && (
          <Section title="Rationale">
            <p>{spec.rationale}</p>
          </Section>
        )}
        {spec.consequences?.length ? (
          <Section title="Consequences">
            <ul>
              {spec.consequences.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Section>
        ) : null}
        {spec.alternatives?.length ? (
          <Section title="Alternatives considered">
            <ul>
              {spec.alternatives.map((item) => (
                <li key={item.title}>
                  <strong>{item.title}</strong>
                  {item.reason ? ` — ${item.reason}` : ''}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
        {spec.supersedes && (
          <Section title="Supersedes">
            <p>
              <code>{spec.supersedes}</code>
            </p>
          </Section>
        )}
        {spec.links?.length ? (
          <Section title="Links">
            <ul>
              {spec.links.map((link, index) => {
                const key = Object.keys(link).find((candidate) => candidate !== 'cardinality');
                return key ? (
                  <li key={`${key}-${index}`}>
                    <strong>{key}</strong>
                    {` — ${String(link[key])}`}
                  </li>
                ) : null;
              })}
            </ul>
          </Section>
        ) : null}
        {spec.references?.length ? (
          <Section title="References">
            <ul>
              {spec.references.map((reference, index) => (
                <li key={`${reference.kind}-${reference.target}-${index}`}>
                  <strong>{reference.kind}</strong>
                  {` — ${reference.label ?? reference.target}`} <code>{reference.target}</code>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
        {spec.tags?.length ? (
          <div className="ds-core-tags">
            {spec.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
