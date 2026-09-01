// The Cost module's full-page demo (`/cost/demo`) — the real CostApp
// (Inventory / Attribution / Reports / Plan review) from
// `@workspec/cost-ui`, against a MemoryRepository seeded with the worked
// "fieldstate-azure" estate (see `cost-seed.ts`). Everything — rule
// toggles, the Fix-coverage promote-to-rule composer, rail reorder — runs in
// memory; nothing leaves the browser. Mirrors `demo.tsx` (Decisions): a full
// in-browser sandbox with `capabilities: { editAttribution: true }`, not
// `c4-demo.tsx`'s read-only showcase, since editing the ruleset live is the
// whole point of this module.
import { QueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import {
  attributionKey,
  CostApp,
  CostStudioProvider,
  createInertLinkResolver,
} from '@workspec/cost-ui';
import type { CostStudioHost } from '@workspec/cost-ui';
import { useTheme } from '@workspec/design';
import '@workspec/cost-ui/styles.css';

import {
  COST_DEMO_ATTRIBUTION_REF,
  COST_DEMO_ESTATE_NAME,
  COST_DEMO_INVENTORY_REF,
  COST_DEMO_TAGPLAN_REF,
  createCostDemoRepository,
} from './cost-seed.js';
import { buildCostReportCsv, downloadCsv } from './export-cost.js';
import {
  CostWebMcpService,
  registerCostWebMcpTools,
  type CostWebMcpActivity,
} from './cost-webmcp.js';
import { WorkbenchBar } from './demo-bar.js';
import { SiteNav } from './nav.js';

const REPO_URL = 'https://github.com/FieldstateNZ/workspec-studio/tree/main/packages';

const CHECKING_ACTIVITY: CostWebMcpActivity = {
  kind: 'checking',
  title: 'Connecting agent tools',
  detail: 'Checking this browser for WebMCP site-tool support.',
};

function createDemoQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: false,
        staleTime: 5_000,
      },
    },
  });
}

export function CostDemo(): ReactElement {
  // Bumping this token discards every in-browser edit by rebuilding the repo.
  const [resetToken, setResetToken] = useState(0);
  const [agentActivity, setAgentActivity] = useState<CostWebMcpActivity>(CHECKING_ACTIVITY);
  // The shell's own Dark/Light preference (Site Review UX pass, finding 03) —
  // never this component's own OS-preference listener.
  const theme = useTheme();

  const repository = useMemo(() => createCostDemoRepository(), [resetToken]);
  const queryClient = useMemo(() => createDemoQueryClient(), [resetToken]);
  const host: CostStudioHost = useMemo(
    () => ({
      repository,
      links: createInertLinkResolver(),
      // A full in-memory sandbox: rail reorder/promotion/removal are all on.
      capabilities: { editAttribution: true },
    }),
    [repository],
  );
  const webMcpService = useMemo(
    () =>
      new CostWebMcpService({
        repository,
        inventoryRef: COST_DEMO_INVENTORY_REF,
        attributionRef: COST_DEMO_ATTRIBUTION_REF,
        onAttributionWritten: (attribution) => {
          queryClient.setQueryData(
            attributionKey(repository, COST_DEMO_ATTRIBUTION_REF),
            attribution,
          );
        },
        onActivity: setAgentActivity,
      }),
    [queryClient, repository],
  );

  useEffect(() => {
    const context = document.modelContext;
    if (context === undefined || typeof context.registerTool !== 'function') {
      setAgentActivity({
        kind: 'unsupported',
        title: 'WebMCP tools available in supported agent browsers',
        detail:
          'The Cost workbench still works normally here; open this page in ChatGPT to share it with an agent.',
      });
      return undefined;
    }

    const controller = new AbortController();
    setAgentActivity(CHECKING_ACTIVITY);
    void registerCostWebMcpTools(context, webMcpService, controller.signal)
      .then(() => {
        if (controller.signal.aborted) return;
        setAgentActivity({
          kind: 'ready',
          title: 'Agent tools ready',
          detail: 'Five WebMCP site tools share this in-browser estate with you.',
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        // A rejected batch may have registered an earlier subset. Abort the
        // shared signal so the browser removes every partial registration.
        controller.abort();
        setAgentActivity({
          kind: 'error',
          title: 'Agent tools could not register',
          detail:
            error instanceof Error ? error.message : 'This browser rejected WebMCP registration.',
        });
      });
    return () => controller.abort();
  }, [webMcpService]);

  async function onExportCsv(): Promise<void> {
    const { filename, csv } = await buildCostReportCsv(
      repository,
      COST_DEMO_INVENTORY_REF,
      COST_DEMO_ATTRIBUTION_REF,
    );
    downloadCsv(filename, csv);
  }

  return (
    <div className="demo">
      <SiteNav repoUrl={REPO_URL} />
      <WorkbenchBar
        crumb={<span className="wb-crumb-value">{COST_DEMO_ESTATE_NAME}</span>}
        actions={
          <>
            <button type="button" className="wb-action" onClick={() => void onExportCsv()}>
              Export CSV
            </button>
            <button
              type="button"
              className="wb-action-ghost"
              onClick={() => {
                setAgentActivity(CHECKING_ACTIVITY);
                setResetToken((n) => n + 1);
              }}
            >
              Reset
            </button>
          </>
        }
      />

      <p className="demo-note" role="note">
        Changes live only in your browser — the real thing writes <code>*.attribution.yaml</code>{' '}
        files in your repo.{' '}
        <span className="demo-blurb">
          80 resources across 9 resource groups, starting at 81.2% coverage with three gaps to
          inspect, preview, and resolve.
        </span>
      </p>

      <section
        className={`cost-agent-status cost-agent-status-${agentActivity.kind}`}
        aria-live="polite"
        aria-label="WebMCP agent activity"
      >
        <span className="cost-agent-kicker">WebMCP</span>
        <strong>{agentActivity.title}</strong>
        <span>{agentActivity.detail}</span>
      </section>

      <CostStudioProvider host={host} queryClient={queryClient} theme={theme}>
        <main className="demo-stage" key={resetToken}>
          <CostApp
            inventoryRef={COST_DEMO_INVENTORY_REF}
            attributionRef={COST_DEMO_ATTRIBUTION_REF}
            tagPlanRef={COST_DEMO_TAGPLAN_REF}
          />
        </main>
      </CostStudioProvider>
    </div>
  );
}
