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
import { WorkspecMark } from '@workspec/design/components';
import '@workspec/cost-ui/styles.css';
import {
  Bot,
  Boxes,
  CalendarDays,
  ChevronsLeft,
  ChevronsRight,
  DollarSign,
  Download,
  FileArchive,
  FileSpreadsheet,
  Github,
  Layers,
  RotateCcw,
} from 'lucide-react';

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
import { Link } from './router.js';
import { ThemeToggle } from './theme-toggle.js';

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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
    const attributionRef = estate.attributionRef;
    if (attributionRef === undefined) return undefined;
    return new CostWebMcpService({
      repository,
      inventoryRef: estate.inventoryRef,
      attributionRef,
      onAttributionWritten: (attribution) => {
        queryClient.setQueryData(attributionKey(repository, attributionRef), attribution);
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

  function resetSample(): void {
    setAgentActivity(CHECKING_ACTIVITY);
    setDownloadStatus('');
    setEstate((current) => initialEstate(current.key + 1));
  }

  const resourceCount =
    estate.seed.inventories?.[estate.inventoryRef]?.spec.resources.length ?? '—';

  return (
    <div className="architecture-studio cost-studio-shell">
      <header className="architecture-app-header">
        <Link className="architecture-app-brand" href="/" aria-label="WorkSpec Studio home">
          <WorkspecMark size={24} />
          <span className="architecture-wordmark">
            work<strong>spec</strong>
          </span>
        </Link>
        <span className="architecture-header-divider" aria-hidden="true" />
        <DollarSign size={16} aria-hidden="true" />
        <strong className="architecture-project-title">{estate.estateName}</strong>
        <span className="architecture-header-spacer" />
        <span className={`architecture-connection architecture-connection-${agentActivity.kind}`}>
          <span aria-hidden="true" />
          WebMCP {agentActivity.kind === 'ready' ? 'ready' : agentActivity.kind}
        </span>
        <a className="architecture-icon-link" href={REPO_URL} aria-label="View source on GitHub">
          <Github size={16} />
        </a>
      </header>

      <div className="architecture-app-body">
        <aside
          className={`architecture-sidebar${sidebarCollapsed ? ' architecture-sidebar-collapsed' : ''}`}
          aria-label="Studio navigation"
        >
          <nav className="architecture-sidebar-nav">
            <p className="architecture-nav-section">Studio</p>
            <span
              className="architecture-nav-item architecture-nav-item-active"
              aria-current="page"
            >
              <DollarSign size={16} />
              <span>Cost Attribution</span>
            </span>
            <Link className="architecture-nav-item" href="/architecture">
              <Layers size={16} />
              <span>Architecture</span>
            </Link>

            <p className="architecture-nav-section">Estate</p>
            <div className="architecture-model-summary">
              <span>
                <Boxes size={14} />
                Resources
                <strong>{resourceCount}</strong>
              </span>
              <span>
                <CalendarDays size={14} />
                Period
                <strong>{estate.period}</strong>
              </span>
            </div>

            <p className="architecture-nav-section">Output</p>
            <button
              type="button"
              className="architecture-nav-item architecture-nav-button"
              aria-label="Download .workspec bundle"
              disabled={estate.attributionRef === undefined}
              title={
                estate.attributionRef === undefined ? 'Create an attribution first' : undefined
              }
              onClick={() => void onDownloadBundle()}
            >
              <FileArchive size={16} />
              <span>.workspec bundle</span>
              <Download size={13} />
            </button>
            <button
              type="button"
              className="architecture-nav-item architecture-nav-button"
              aria-label="Export CSV"
              disabled={estate.attributionRef === undefined}
              onClick={() => void onExportCsv()}
            >
              <FileSpreadsheet size={16} />
              <span>Export CSV</span>
              <Download size={13} />
            </button>
          </nav>

          <section
            className={`architecture-agent-panel architecture-agent-panel-${agentActivity.kind}`}
            aria-live="polite"
            aria-label="WebMCP agent activity"
          >
            <div className="architecture-agent-heading">
              <Bot size={15} />
              <span>Agent</span>
              <small>WebMCP</small>
            </div>
            <strong>{agentActivity.title}</strong>
            <p>{agentActivity.detail}</p>
          </section>

          <div className="architecture-sidebar-footer">
            <button type="button" onClick={resetSample}>
              <RotateCcw size={14} />
              <span>Reset sample</span>
            </button>
            <span className="architecture-sidebar-note">Browser only · no cloud upload</span>
            <ThemeToggle collapsed={sidebarCollapsed} />
            <button
              type="button"
              className="architecture-sidebar-collapse"
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!sidebarCollapsed}
              onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            >
              {sidebarCollapsed ? <ChevronsRight size={15} /> : <ChevronsLeft size={15} />}
              <span>Collapse</span>
            </button>
          </div>
        </aside>

        <main className="architecture-workspace cost-studio-workspace">
          <p className="demo-note" role="note">
            Everything stays in your browser. An agent can replace this sample with a stocktake,
            help create the attribution, and prepare a local <code>.workspec</code> bundle.{' '}
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

          {estate.attributionRef !== undefined ? (
            <CostStudioProvider host={host} queryClient={queryClient} theme={theme}>
              <div className="demo-stage" key={estate.key}>
                <CostApp
                  inventoryRef={estate.inventoryRef}
                  attributionRef={estate.attributionRef}
                  {...(estate.tagPlanRef !== undefined ? { tagPlanRef: estate.tagPlanRef } : {})}
                />
              </div>
            </CostStudioProvider>
          ) : (
            <div className="cost-setup-stage">
              <div className="cost-setup-card">
                <span className="cost-agent-kicker">Stocktake loaded</span>
                <h1>{estate.estateName}</h1>
                <p>
                  The inventory and {estate.period} spend are ready in this browser. Ask your agent
                  to inspect the setup, agree a reporting dimension with you, and create the
                  attribution.
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
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
