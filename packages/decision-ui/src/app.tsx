import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { Ref } from '@workspec/decision-schema';
import { Button } from '@workspec/design/components';
import { DecisionWorkspace } from './workspace.js';
import { DecisionAdr } from './adr.js';
import { useCapabilities } from './context.js';

export type DecisionView = 'record' | 'adr';

export interface DecisionAppProps {
  decisionRef: Ref;
  initialView?: DecisionView;
}

/** The core Studio: consume the ADR by default and enter record editing explicitly. */
export function DecisionApp(props: DecisionAppProps): ReactElement {
  const initialView = props.initialView ?? 'adr';
  const [view, setView] = useState<DecisionView>(initialView);
  const capabilities = useCapabilities();

  useEffect(() => setView(initialView), [initialView, props.decisionRef]);

  return (
    <div className="ds-app">
      {view === 'adr' ? (
        <DecisionAdr
          decisionRef={props.decisionRef}
          action={
            capabilities.editDecision ? (
              <Button size="sm" onClick={() => setView('record')}>
                Edit
              </Button>
            ) : undefined
          }
        />
      ) : (
        <DecisionWorkspace
          decisionRef={props.decisionRef}
          action={
            <Button size="sm" variant="secondary" onClick={() => setView('adr')}>
              Cancel
            </Button>
          }
        />
      )}
    </div>
  );
}
