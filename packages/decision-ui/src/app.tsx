// `DecisionApp` — the full four-view app. A segmented nav (the design system's
// Tabs: Options / Compare / Catalog / ADR) switches among the Workspace,
// Compare, Catalog, and ADR views, managing view state internally. It re-provides
// the host contract with a `navigate` that drives its own view switch, so the
// Workspace's Compare / Decide buttons and Compare's "open the ADR" link route
// within the app (falling back to the host's own navigate for other targets).
//
// This is what S6 exposes as the module-federation remote's full app; the
// individual views stay exported for hosts that want to place them themselves.

import { useCallback, useState } from 'react';
import type { ReactElement } from 'react';
import type { Ref } from '@workspec/decision-schema';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@workspec/design/components';
import { HostNavigateProvider, useDecision, useNavigate } from './context.js';
import { resolveCatalogRef } from './host.js';
import type { LinkTarget } from './host.js';
import { DecisionWorkspace } from './workspace.js';
import { DecisionCompare } from './compare.js';
import { DecisionCatalog } from './catalog.js';
import { DecisionAdr } from './adr.js';

/** The four navigable views of the app. */
export type DecisionView = 'options' | 'compare' | 'catalog' | 'adr';

const VIEWS: DecisionView[] = ['options', 'compare', 'catalog', 'adr'];

function isView(value: string | undefined): value is DecisionView {
  return value !== undefined && (VIEWS as string[]).includes(value);
}

/** Props for {@link DecisionApp}. */
export interface DecisionAppProps {
  /** The ref of the decision to open. */
  decisionRef: Ref;
  /** Which view to show first (default `options`). */
  initialView?: DecisionView;
}

function Notice(props: { tone: 'muted' | 'error'; children: string }): ReactElement {
  return (
    <div className={props.tone === 'error' ? 'ds-notice ds-notice-error' : 'ds-notice'}>
      {props.children}
    </div>
  );
}

const VIEW_LABEL: Record<DecisionView, string> = {
  options: 'Options',
  compare: 'Compare',
  catalog: 'Catalog',
  adr: 'ADR',
};

/** Mount the complete four-view Decision Studio app for a single decision. */
export function DecisionApp(props: DecisionAppProps): ReactElement {
  const { decisionRef, initialView = 'options' } = props;
  const [view, setView] = useState<DecisionView>(initialView);
  const hostNavigate = useNavigate();

  const decisionQuery = useDecision(decisionRef);
  const decision = decisionQuery.data;

  const navigate = useCallback(
    (target: LinkTarget): void => {
      if (target.kind === 'view' && isView(target.target)) {
        setView(target.target);
        return;
      }
      hostNavigate?.(target);
    },
    [hostNavigate],
  );

  if (decisionQuery.isPending) return <Notice tone="muted">Loading decision…</Notice>;
  if (decisionQuery.isError)
    return (
      <Notice tone="error">{`Could not load decision: ${decisionQuery.error.message}`}</Notice>
    );
  if (decision === undefined) return <Notice tone="error">Decision not found.</Notice>;

  const catalogRef = resolveCatalogRef(decisionRef, decision);
  const optionCount = decision.spec.options.length;

  return (
    <HostNavigateProvider navigate={navigate}>
      <div className="ds-app">
        <Tabs value={view} onValueChange={(v) => setView(v as DecisionView)}>
          <div className="ds-appbar">
            <TabsList aria-label="Decision views">
              {VIEWS.map((v) => (
                <TabsTrigger key={v} value={v} className="gap-2">
                  {VIEW_LABEL[v]}
                  {v === 'options' && (
                    <span className="ds-n min-w-[18px] rounded-full border border-border bg-card px-1.5 text-center font-mono text-[10px] text-muted-foreground">
                      {optionCount}
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="ds-view">
            <TabsContent value="options">
              <DecisionWorkspace decisionRef={decisionRef} />
            </TabsContent>
            <TabsContent value="compare">
              <DecisionCompare decisionRef={decisionRef} />
            </TabsContent>
            <TabsContent value="catalog">
              <DecisionCatalog catalogRef={catalogRef} />
            </TabsContent>
            <TabsContent value="adr">
              <DecisionAdr decisionRef={decisionRef} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </HostNavigateProvider>
  );
}
