import { QueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { flushSync } from 'react-dom';
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
  COST_DEMO_PERIOD,
  COST_DEMO_SPEND_REF,
  COST_DEMO_TAGPLAN_REF,
  createCostDemoSeed,
} from './cost-seed.js';
import { buildCostReportCsv, downloadCsv } from './export-cost.js';
import {
  CostWebMcpService,
  createCostWebMcpTools,
  type CostWebMcpActivity,
} from './cost-webmcp.js';
import {
  CostSetupWebMcpService,
  CostSnapshotWebMcpService,
  buildWorkspecBundle,
  createSetupTools,
  createSnapshotRepository,
  createSnapshotTool,
  downloadWorkspecBundle,
  registerCostDemoTools,
  stateFromSnapshot,
  type CostEstateState,
} from './cost-snapshot.js';
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
    defaultOptions: { queries: { refetchOnWindowFocus: false, retry: false, staleTime: 5_000 } },
  });
}

function initialEstate(key = 0): CostEstateState {
  return {
    key,
    estateName: COST_DEMO_ESTATE_NAME,
    period: COST_DEMO_PERIOD,
    inventoryRef: COST_DEMO_INVENTORY_REF,
    spendRef: COST_DEMO_SPEND_REF,
    attributionRef: COST_DEMO_ATTRIBUTION_REF,
    tagPlanRef: COST_DEMO_TAGPLAN_REF,
    seed: createCostDemoSeed(),
    imported: false,
  };
}

export function CostDemo(): ReactElement {
  const [estate, setEstate] = useState<CostEstateState>(() => initialEstate());
  const [agentActivity, setAgentActivity] = useState<CostWebMcpActivity>(CHECKING_ACTIVITY);
  const [downloadStatus, setDownloadStatus] = useState('');
  const theme = useTheme();
  const repository = useMemo(() => createSnapshotRepository(estate), [estate.key]);
  const queryClient = useMemo(() => createDemoQueryClient(), [estate.key]);
  const host: CostStudioHost = useMemo(
    () => ({
      repository,
      links: createInertLinkResolver(),
      capabilities: { editAttribution: true },
    }),
    [repository],
  );

  const costService = useMemo(() => {
    if (estate.attributionRef === undefined) return undefined;
    return new CostWebMcpService({
      repository,
      inventoryRef: estate.inventoryRef,
      attributionRef: estate.attributionRef,
      onAttributionWritten: (attribution) => {
        queryClient.setQueryData(attributionKey(repository, estate.attributionRef!), attribution);
      },
      onActivity: setAgentActivity,
    });
  }, [estate.attributionRef, estate.inventoryRef, queryClient, repository]);

  const setupService = useMemo(() => {
    if (estate.attributionRef !== undefined) return undefined;
    return new CostSetupWebMcpService(repository, estate.inventoryRef, (ref, attribution) => {
      queryClient.setQueryData(attributionKey(repository, ref), attribution);
      flushSync(() => {
        setEstate((current) => ({ ...current, attributionRef: ref }));
        setAgentActivity({
          kind: 'applied',
          title: 'Attribution created',
          detail: 'The workbench is ready. Inspect gaps and preview rules before applying them.',
        });
      });
    });
  }, [estate.attributionRef, estate.inventoryRef, queryClient, repository]);

  const snapshotService = useMemo(
    () =>
      new CostSnapshotWebMcpService((snapshot) => {
        flushSync(() => {
          setEstate((current) => stateFromSnapshot(snapshot, current.key + 1));
          setDownloadStatus('');
          setAgentActivity({
            kind: 'applied',
            title: 'Stocktake loaded',
            detail: `${snapshot.inventory.spec.resources.length} resources replaced the demo estate. No cloud account was accessed.`,
          });
        });
      }),
    [],
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
    const tools = [
      createSnapshotTool(snapshotService),
      ...(costService !== undefined
        ? createCostWebMcpTools(costService)
        : setupService !== undefined
          ? createSetupTools(setupService)
          : []),
    ];
    void registerCostDemoTools(context, tools, controller.signal)
      .then(() => {
        if (controller.signal.aborted) return;
        setAgentActivity({
          kind: 'ready',
          title: costService !== undefined ? 'Agent tools ready' : 'Setup tools ready',
          detail:
            costService !== undefined
              ? 'Six tools can replace, inspect, and improve this in-browser estate.'
              : 'The agent can inspect this stocktake and create its first attribution dimension.',
        });
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
  }, [costService, setupService, snapshotService]);

  async function onExportCsv(): Promise<void> {
    if (estate.attributionRef === undefined) return;
    const result = await buildCostReportCsv(repository, estate.inventoryRef, estate.attributionRef);
    downloadCsv(result.filename, result.csv);
  }

  async function onDownloadBundle(): Promise<void> {
    if (estate.attributionRef === undefined) return;
    try {
      const bundle = await buildWorkspecBundle(
        repository,
        estate.inventoryRef,
        estate.spendRef,
        estate.attributionRef,
        estate.period,
      );
      downloadWorkspecBundle(bundle.filename, bundle.bytes);
      setDownloadStatus(
        `Downloaded ${bundle.filename} with ${bundle.files.length} validated artifacts.`,
      );
    } catch (error) {
      setDownloadStatus(error instanceof Error ? error.message : 'The bundle could not be built.');
    }
  }

  return (
    <div className="demo">
      <SiteNav repoUrl={REPO_URL} />
      <WorkbenchBar
        crumb={<span className="wb-crumb-value">{estate.estateName}</span>}
        actions={
          <>
            <button
              type="button"
              className="wb-action wb-action-primary"
              disabled={estate.attributionRef === undefined}
              title={
                estate.attributionRef === undefined ? 'Create an attribution first' : undefined
              }
              onClick={() => void onDownloadBundle()}
            >
              Download .workspec bundle
            </button>
            <button
              type="button"
              className="wb-action"
              disabled={estate.attributionRef === undefined}
              onClick={() => void onExportCsv()}
            >
              Export CSV
            </button>
            <button
              type="button"
              className="wb-action-ghost"
              onClick={() => {
                setAgentActivity(CHECKING_ACTIVITY);
                setDownloadStatus('');
                setEstate((current) => initialEstate(current.key + 1));
              }}
            >
              Reset
            </button>
          </>
        }
      />

      <p className="demo-note" role="note">
        Everything stays in your browser. An agent can replace this sample with a stocktake, help
        create the attribution, and prepare a local <code>.workspec</code> bundle.{' '}
        <span className="demo-blurb">
          {estate.imported
            ? 'This imported snapshot has not contacted or changed its cloud provider.'
            : 'The sample starts with 80 resources and three attribution gaps.'}
        </span>
      </p>
      {downloadStatus !== '' && (
        <p className="cost-download-status" role="status">
          {downloadStatus}
        </p>
      )}
      <section
        className={`cost-agent-status cost-agent-status-${agentActivity.kind}`}
        aria-live="polite"
        aria-label="WebMCP agent activity"
      >
        <span className="cost-agent-kicker">WebMCP</span>
        <strong>{agentActivity.title}</strong>
        <span>{agentActivity.detail}</span>
      </section>

      {estate.attributionRef !== undefined ? (
        <CostStudioProvider host={host} queryClient={queryClient} theme={theme}>
          <main className="demo-stage" key={estate.key}>
            <CostApp
              inventoryRef={estate.inventoryRef}
              attributionRef={estate.attributionRef}
              {...(estate.tagPlanRef !== undefined ? { tagPlanRef: estate.tagPlanRef } : {})}
            />
          </main>
        </CostStudioProvider>
      ) : (
        <main className="cost-setup-stage">
          <div className="cost-setup-card">
            <span className="cost-agent-kicker">Stocktake loaded</span>
            <h1>{estate.estateName}</h1>
            <p>
              The inventory and {estate.period} spend are ready in this browser. Ask your agent to
              inspect the setup, agree a reporting dimension with you, and create the attribution.
            </p>
            <ol>
              <li>Inspect resource groups, accounts, and observed tags.</li>
              <li>Agree the primary dimension and allowed values.</li>
              <li>Create attribution, resolve gaps, then download the bundle.</li>
            </ol>
            <p className="cost-setup-safety">
              No cloud credentials are used and no cloud resource can be changed here.
            </p>
          </div>
        </main>
      )}
    </div>
  );
}
