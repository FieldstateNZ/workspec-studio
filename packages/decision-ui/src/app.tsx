import { useState } from 'react';
import type { ReactElement } from 'react';
import type { Ref } from '@workspec/decision-schema';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@workspec/design/components';
import { DecisionWorkspace } from './workspace.js';
import { DecisionAdr } from './adr.js';

export type DecisionView = 'record' | 'adr';

export interface DecisionAppProps {
  decisionRef: Ref;
  initialView?: DecisionView;
}

/** The core Studio: edit the canonical record and preview its ADR projection. */
export function DecisionApp(props: DecisionAppProps): ReactElement {
  const [view, setView] = useState<DecisionView>(props.initialView ?? 'record');
  return (
    <div className="ds-app">
      <Tabs value={view} onValueChange={(value) => setView(value as DecisionView)}>
        <div className="ds-appbar">
          <TabsList aria-label="Decision views">
            <TabsTrigger value="record">Record</TabsTrigger>
            <TabsTrigger value="adr">ADR preview</TabsTrigger>
          </TabsList>
        </div>
        <div className="ds-view">
          <TabsContent value="record">
            <DecisionWorkspace decisionRef={props.decisionRef} />
          </TabsContent>
          <TabsContent value="adr">
            <DecisionAdr decisionRef={props.decisionRef} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
