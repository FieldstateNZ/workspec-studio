// `CostApp` — the tabbed four-view shell: Inventory · Attribution · Reports ·
// Plan review (default Attribution). One `AttributionWorkbenchState` is
// lifted here and shared between the Attribution tab and Reports, so
// toggling a rule in the rail is immediately visible in Reports' stats too.
// `CostApp` re-provides the host contract with a `navigate` that drives its
// own tab switch — Reports' "Fix in workbench →" jumps to Attribution with
// the unattributed filter already applied, exactly like Decision Studio's
// Compare→ADR cross-tab link.

import { useCallback, useState } from 'react';
import type { ReactElement } from 'react';
import type { Ref } from '@workspec/cost-schema';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@workspec/design/components';
import { HostNavigateProvider, useNavigate } from './context.js';
import type { CostLinkTarget } from './host.js';
import { AttributionWorkbench, DEFAULT_WORKBENCH_STATE } from './attribution-workbench.js';
import type { AttributionWorkbenchState } from './attribution-workbench.js';
import { CostInventory } from './cost-inventory.js';
import { CostReport } from './cost-report.js';
import { TagPlanView } from './tag-plan-view.js';

/** The four navigable views of the app. */
export type CostView = 'inventory' | 'attribution' | 'reports' | 'plan';

const VIEWS: CostView[] = ['inventory', 'attribution', 'reports', 'plan'];

function isView(value: string | undefined): value is CostView {
  return value !== undefined && (VIEWS as string[]).includes(value);
}

const VIEW_LABEL: Record<CostView, string> = {
  inventory: 'Inventory',
  attribution: 'Attribution',
  reports: 'Reports',
  plan: 'Plan review',
};

/** Props for {@link CostApp}. */
export interface CostAppProps {
  inventoryRef: Ref;
  attributionRef: Ref;
  /** The tag plan to render in Plan review; omit to show the "no plan yet" empty state naming the CLI. */
  tagPlanRef?: Ref;
  /** Which view to show first (default `attribution`). */
  initialView?: CostView;
}

/** Mount the complete four-view Cost Attribution app for one inventory + attribution. */
export function CostApp(props: CostAppProps): ReactElement {
  const { inventoryRef, attributionRef, tagPlanRef, initialView = 'attribution' } = props;
  const [view, setView] = useState<CostView>(initialView);
  const [workbenchState, setWorkbenchState] = useState<AttributionWorkbenchState>(DEFAULT_WORKBENCH_STATE);
  const hostNavigate = useNavigate();

  const navigate = useCallback(
    (target: CostLinkTarget): void => {
      if (target.kind === 'view' && isView(target.target)) {
        setView(target.target);
        return;
      }
      if (target.kind === 'fix-coverage') {
        setWorkbenchState((prev) => ({ ...prev, filter: 'unattributed', cluster: null }));
        setView('attribution');
        return;
      }
      hostNavigate?.(target);
    },
    [hostNavigate],
  );

  const fixCoverage = useCallback(
    () => navigate({ kind: 'fix-coverage', label: 'Fix in workbench' }),
    [navigate],
  );

  return (
    <HostNavigateProvider navigate={navigate}>
      <div className="cost-app">
        <Tabs value={view} onValueChange={(v) => setView(v as CostView)}>
          <div className="cost-appbar">
            <TabsList aria-label="Cost views">
              {VIEWS.map((v) => (
                <TabsTrigger key={v} value={v}>
                  {VIEW_LABEL[v]}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="cost-view">
            <TabsContent value="inventory">
              <CostInventory inventoryRef={inventoryRef} attributionRef={attributionRef} />
            </TabsContent>
            <TabsContent value="attribution">
              <AttributionWorkbench
                inventoryRef={inventoryRef}
                attributionRef={attributionRef}
                state={workbenchState}
                onStateChange={setWorkbenchState}
              />
            </TabsContent>
            <TabsContent value="reports">
              <CostReport
                inventoryRef={inventoryRef}
                attributionRef={attributionRef}
                disabledRuleIds={workbenchState.disabledRuleIds}
                onFixCoverage={fixCoverage}
              />
            </TabsContent>
            <TabsContent value="plan">
              <TagPlanView inventoryRef={inventoryRef} {...(tagPlanRef !== undefined ? { tagPlanRef } : {})} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </HostNavigateProvider>
  );
}
