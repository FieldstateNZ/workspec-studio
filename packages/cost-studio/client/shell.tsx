// The standalone host chrome: a slim topbar (brand + example crumb + theme
// toggle + rule/resource counts) wrapping the mounted CostApp. It lives
// INSIDE the provider, so it reads the inventory/attribution/tag-plan lists
// through the same repository port (`useInventories` etc.) the views use.
// Theme is lifted to `main.tsx`, which owns the `theme` prop the provider
// applies as `data-theme`.
//
// This shell does NOT re-render a brand crumb, precedence pill, or coverage
// figure inside the workbench body — `CostApp`'s `.cost-appbar` already owns
// the view tabs, and `AttributionWorkbench`'s coverage row already owns the
// "first match wins" precedence pill and the live coverage percentage (see
// `packages/cost-ui/src/attribution-workbench.tsx`). This topbar is
// deliberately complementary: brand identity, which example is loaded, the
// Dark/Light toggle, and a *static* rule/resource count the workbench body
// doesn't show anywhere itself.
//
// The standalone shell auto-selects the first discovered inventory +
// attribution (+ tag plan, if any) rather than offering a picker —
// `workspec-cost report`/`plan` already assume exactly one of each in scope,
// and C5b ships no multi-artifact picker UI.

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  attributionKey,
  attributionsKey,
  CostWebMcpService,
  CostApp,
  registerCostWebMcpTools,
  useAttribution,
  useAttributions,
  useInventories,
  useInventory,
  useRepository,
  useTagPlans,
} from '@workspec/cost-ui';
import type { CostWebMcpActivity, ThemeName } from '@workspec/cost-ui';
import { CostSetupWebMcpService, registerCostSetupWebMcpTools } from './setup-webmcp.js';

export interface ShellProps {
  theme: ThemeName;
  onSelectTheme: (theme: ThemeName) => void;
}

const THEME_OPTIONS: ThemeName[] = ['dark', 'light'];

const CHECKING_ACTIVITY: CostWebMcpActivity = {
  kind: 'checking',
  title: 'Connecting agent tools',
  detail: 'Checking this browser for WebMCP site-tool support.',
};

export function Shell(props: ShellProps): ReactNode {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const [agentActivity, setAgentActivity] = useState<CostWebMcpActivity>(CHECKING_ACTIVITY);
  const inventories = useInventories();
  const attributions = useAttributions();
  const tagPlans = useTagPlans();

  const firstInventory = inventories.data?.[0];
  const firstAttribution = attributions.data?.[0];
  const firstTagPlan = tagPlans.data?.[0];

  const inventory = useInventory(firstInventory?.ref);
  const attribution = useAttribution(firstAttribution?.ref);

  const ruleCount = attribution.data?.spec.rules.length;
  const resourceCount = inventory.data?.spec.resources.length;

  const listsPending = inventories.isPending || attributions.isPending;
  const listsError = inventories.isError || attributions.isError;
  const errorMessage = inventories.error?.message ?? attributions.error?.message;

  const costService = useMemo(() => {
    if (firstInventory === undefined || firstAttribution === undefined) return undefined;
    return new CostWebMcpService({
      repository,
      inventoryRef: firstInventory.ref,
      attributionRef: firstAttribution.ref,
      onAttributionWritten: (nextAttribution) => {
        queryClient.setQueryData(attributionKey(repository, firstAttribution.ref), nextAttribution);
      },
      onActivity: setAgentActivity,
    });
  }, [firstAttribution, firstInventory, queryClient, repository]);

  const setupService = useMemo(() => {
    if (firstInventory === undefined || firstAttribution !== undefined) return undefined;
    return new CostSetupWebMcpService({
      repository,
      inventoryRef: firstInventory.ref,
      onAttributionWritten: (ref, nextAttribution) => {
        queryClient.setQueryData(attributionKey(repository, ref), nextAttribution);
        void queryClient.invalidateQueries({ queryKey: attributionsKey(repository) });
      },
    });
  }, [firstAttribution, firstInventory, queryClient, repository]);

  useEffect(() => {
    const context = document.modelContext;
    if (context === undefined || typeof context.registerTool !== 'function') {
      setAgentActivity({
        kind: 'unsupported',
        title: 'Agent tools need a supported browser',
        detail:
          'The workbench still works normally; open this localhost page in ChatGPT to share it with an agent.',
      });
      return undefined;
    }
    if (firstInventory === undefined) {
      setAgentActivity({
        kind: 'checking',
        title: 'Waiting for a stocktake',
        detail: 'Run workspec-cost stocktake, then refresh this page.',
      });
      return undefined;
    }

    const controller = new AbortController();
    setAgentActivity(CHECKING_ACTIVITY);
    const registration =
      costService !== undefined
        ? registerCostWebMcpTools(context, costService, controller.signal)
        : setupService !== undefined
          ? registerCostSetupWebMcpTools(context, setupService, controller.signal)
          : Promise.reject(new Error('No cost tool service is available for this estate.'));
    void registration
      .then(() => {
        if (controller.signal.aborted) return;
        setAgentActivity(
          costService !== undefined
            ? {
                kind: 'ready',
                title: 'Agent tools ready',
                detail:
                  'Five tools share these local artifacts with you; writes update the YAML and workbench together.',
              }
            : {
                kind: 'ready',
                title: 'Setup tools ready',
                detail:
                  'The agent can inspect this stocktake and create the first attribution after agreeing its dimension with you.',
              },
        );
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        controller.abort();
        setAgentActivity({
          kind: 'error',
          title: 'Agent tools could not register',
          detail:
            error instanceof Error ? error.message : 'This browser rejected WebMCP registration.',
        });
      });
    return () => controller.abort();
  }, [costService, firstInventory, setupService]);

  return (
    <>
      <header className="csh-topbar">
        <span className="csh-glyph" aria-hidden="true" />
        <span className="csh-brand">workspec-cost</span>
        <span className="csh-slash">/ studio</span>
        {firstInventory !== undefined && (
          <span className="csh-crumb">{`estate ▸ ${firstInventory.name ?? firstInventory.slug ?? firstInventory.ref}`}</span>
        )}
        <span className="csh-spacer" />
        <div className="csh-toggle" role="group" aria-label="Theme">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              className={`csh-toggle-seg${props.theme === option ? ' csh-toggle-seg--active' : ''}`}
              aria-pressed={props.theme === option}
              onClick={() => props.onSelectTheme(option)}
            >
              {option === 'dark' ? 'Dark' : 'Light'}
            </button>
          ))}
        </div>
        {ruleCount !== undefined && resourceCount !== undefined && (
          <span className="csh-counts">{`${ruleCount} rules · ${resourceCount} resources`}</span>
        )}
      </header>

      <section
        className={`csh-agent-status csh-agent-status--${agentActivity.kind}`}
        aria-live="polite"
        aria-label="WebMCP agent activity"
      >
        <span className="csh-agent-kicker">WebMCP</span>
        <strong>{agentActivity.title}</strong>
        <span>{agentActivity.detail}</span>
      </section>

      <main className="csh-main">
        {listsError ? (
          <div className="csh-empty">{`Could not reach the host API: ${errorMessage ?? 'unknown error'}`}</div>
        ) : firstInventory !== undefined && firstAttribution !== undefined ? (
          <CostApp
            inventoryRef={firstInventory.ref}
            attributionRef={firstAttribution.ref}
            {...(firstTagPlan !== undefined ? { tagPlanRef: firstTagPlan.ref } : {})}
          />
        ) : (
          <div className="csh-empty">
            {listsPending
              ? 'Loading…'
              : firstInventory === undefined
                ? 'No inventory found — run "workspec-cost stocktake" against this directory, then refresh.'
                : 'Stocktake loaded. Setup tools are ready — ask the agent to inspect it and help you create the first attribution.'}
          </div>
        )}
      </main>
    </>
  );
}
