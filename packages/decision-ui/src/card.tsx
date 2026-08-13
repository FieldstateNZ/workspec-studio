import type { ReactElement } from 'react';
import type { Ref } from '@workspec/decision-schema';
import { Card, Lbl } from '@workspec/design/components';
import { useDecision } from './context.js';
import { decisionSlug } from './host.js';

export interface DecisionCardProps {
  decisionRef: Ref;
}

export function DecisionCard(props: DecisionCardProps): ReactElement {
  const query = useDecision(props.decisionRef);
  if (query.isPending) return <Card className="ds-card ds-card-msg">Loading…</Card>;
  if (query.isError || query.data === undefined)
    return <Card className="ds-card ds-card-msg ds-card-error">Decision unavailable.</Card>;
  const decision = query.data;
  return (
    <Card className="ds-card">
      <div className="ds-card-head">
        <Lbl>{`Decision · ${decisionSlug(decision, props.decisionRef)}`}</Lbl>
        <span className={`ds-core-status ds-core-status-${decision.spec.status}`}>
          {decision.spec.status}
        </span>
      </div>
      <h3 className="ds-card-title">{decision.spec.title}</h3>
      <p className="ds-core-card-decision">{decision.spec.decision}</p>
    </Card>
  );
}
