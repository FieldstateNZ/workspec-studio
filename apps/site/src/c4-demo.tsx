import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { flushSync } from 'react-dom';
import { C4Explorer, createInertLinkResolver } from '@workspec/c4-ui';
import type { C4StudioHost } from '@workspec/c4-ui';
import '@workspec/c4-ui/styles.css';
import { useTheme } from '@workspec/design';
import { WorkspecMark } from '@workspec/design/components';
import {
  Bot,
  Boxes,
  DollarSign,
  Download,
  FileArchive,
  Github,
  Layers,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
} from 'lucide-react';

import {
  ArchitectureWebMcpService,
  DEFAULT_ARCHITECTURE_SNAPSHOT,
  buildArchitectureBundle,
  buildArchitectureSvgBundle,
  buildArchitectureWorkspace,
  createArchitectureWebMcpTools,
  downloadBytes,
  type ArchitectureActivity,
  type ArchitectureWorkspace,
} from './architecture-snapshot.js';
import type { WebMcpModelContext } from './cost-webmcp.js';
import { Link } from './router.js';
import { ThemeToggle } from './theme-toggle.js';

const REPO_URL = 'https://github.com/FieldstateNZ/workspec-studio/tree/main/packages';
const CHECKING_ACTIVITY: ArchitectureActivity = {
  kind: 'checking',
  title: 'Connecting agent tools',
  detail: 'Checking this browser for WebMCP site-tool support.',
};

const registrationTails = new WeakMap<WebMcpModelContext, Promise<void>>();

async function registerArchitectureTools(
  context: WebMcpModelContext,
  service: ArchitectureWebMcpService,
  signal: AbortSignal,
): Promise<void> {
  const prior = registrationTails.get(context) ?? Promise.resolve();
  const current = prior
    .catch(() => undefined)
    .then(async () => {
      for (const tool of createArchitectureWebMcpTools(service)) {
        if (signal.aborted) return;
        await context.registerTool(tool, { signal });
      }
    });
  registrationTails.set(context, current);
  await current;
  if (registrationTails.get(context) === current) registrationTails.delete(context);
}

export function C4Demo(): ReactElement {
  const theme = useTheme();
  const [workspace, setWorkspace] = useState<ArchitectureWorkspace | null>(null);
  const workspaceRef = useRef<ArchitectureWorkspace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadStatus, setDownloadStatus] = useState('');
  const [agentActivity, setAgentActivity] = useState<ArchitectureActivity>(CHECKING_ACTIVITY);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const host = useMemo<C4StudioHost>(
    () => ({
      linkResolver: createInertLinkResolver(),
      capabilities: { editLayout: true },
      source: {
        async listFiles(dirPath) {
          const files = workspaceRef.current?.files ?? {};
          const prefix = dirPath.endsWith('/') ? dirPath : `${dirPath}/`;
          return Object.keys(files).filter((path) => {
            if (!path.startsWith(prefix)) return false;
            const rest = path.slice(prefix.length);
            return rest.length > 0 && !rest.includes('/');
          });
        },
        async readFile(path) {
          const content = workspaceRef.current?.files[path];
          if (content === undefined) throw new Error(`No in-browser file at "${path}".`);
          return content;
        },
        async writeFile(path, content) {
          const current = workspaceRef.current;
          if (current === null) throw new Error('The architecture is still loading.');
          const next = { ...current, files: { ...current.files, [path]: content } };
          workspaceRef.current = next;
          setWorkspace(next);
          setDownloadStatus('Layout updated in this browser and included in .workspec downloads.');
        },
        async exists(path) {
          return workspaceRef.current?.files[path] !== undefined;
        },
      },
    }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    void buildArchitectureWorkspace(DEFAULT_ARCHITECTURE_SNAPSHOT, 0, false).then(
      (loaded) => {
        if (cancelled) return;
        workspaceRef.current = loaded;
        setWorkspace(loaded);
      },
      (reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const service = useMemo(
    () =>
      new ArchitectureWebMcpService({
        getWorkspace: () => {
          const current = workspaceRef.current;
          if (current === null) throw new Error('The architecture is still loading.');
          return current;
        },
        onWorkspace: (next) => {
          flushSync(() => {
            workspaceRef.current = next;
            setWorkspace(next);
            setDownloadStatus('');
          });
        },
        onActivity: setAgentActivity,
      }),
    [],
  );

  useEffect(() => {
    if (workspace === null) return undefined;
    const context = document.modelContext;
    if (context === undefined || typeof context.registerTool !== 'function') {
      setAgentActivity({
        kind: 'unsupported',
        title: 'WebMCP tools available in supported agent browsers',
        detail:
          'The Architecture Studio still works normally here; open this page in ChatGPT to share it with an agent.',
      });
      return undefined;
    }
    const controller = new AbortController();
    setAgentActivity(CHECKING_ACTIVITY);
    void registerArchitectureTools(context, service, controller.signal).then(
      () => {
        if (!controller.signal.aborted) {
          setAgentActivity({
            kind: 'ready',
            title: 'Agent tools ready',
            detail:
              'Five tools can replace, inspect, preview, and evolve this in-browser architecture.',
          });
        }
      },
      (reason: unknown) => {
        if (controller.signal.aborted) return;
        controller.abort();
        setAgentActivity({
          kind: 'error',
          title: 'Agent tools could not register',
          detail:
            reason instanceof Error ? reason.message : 'This browser rejected WebMCP registration.',
        });
      },
    );
    return () => controller.abort();
  }, [service, workspace === null]);

  async function reset(): Promise<void> {
    try {
      const next = await buildArchitectureWorkspace(
        DEFAULT_ARCHITECTURE_SNAPSHOT,
        (workspaceRef.current?.key ?? 0) + 1,
        false,
      );
      workspaceRef.current = next;
      setWorkspace(next);
      setDownloadStatus('');
      setAgentActivity({
        kind: 'applied',
        title: 'Sample architecture restored',
        detail: 'The five agent tools remain ready against the restored in-browser model.',
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  function downloadWorkspec(): void {
    if (workspace === null) return;
    const bundle = buildArchitectureBundle(workspace);
    downloadBytes(bundle.filename, bundle.bytes);
    setDownloadStatus(
      `Downloaded ${bundle.filename} with ${bundle.files.length} validated artifacts.`,
    );
  }

  async function downloadSvgs(): Promise<void> {
    if (workspace === null) return;
    try {
      const bundle = await buildArchitectureSvgBundle(workspace, theme);
      downloadBytes(bundle.filename, bundle.bytes);
      setDownloadStatus(
        `Downloaded ${bundle.filename} with ${bundle.files.length} rendered diagrams.`,
      );
    } catch (reason) {
      setDownloadStatus(
        reason instanceof Error ? reason.message : 'The SVG bundle could not be built.',
      );
    }
  }

  return (
    <div className="architecture-studio">
      <header className="architecture-app-header">
        <Link className="architecture-app-brand" href="/" aria-label="WorkSpec Studio home">
          <WorkspecMark size={24} />
          <span className="architecture-wordmark">
            work<strong>spec</strong>
          </span>
        </Link>
        <span className="architecture-header-divider" aria-hidden="true" />
        <button
          type="button"
          className="architecture-sidebar-toggle"
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!sidebarCollapsed}
          onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
        >
          {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
        <Layers size={16} aria-hidden="true" />
        <strong className="architecture-project-title">
          {workspace?.snapshot.system.name ?? 'Architecture Studio'}
        </strong>
        <span className="architecture-header-spacer" />
        <span className={`architecture-connection architecture-connection-${agentActivity.kind}`}>
          <span aria-hidden="true" />
          WebMCP {agentActivity.kind === 'ready' ? 'ready' : agentActivity.kind}
        </span>
        <a className="architecture-icon-link" href={REPO_URL} aria-label="View source on GitHub">
          <Github size={16} />
        </a>
        <ThemeToggle />
      </header>

      <div className="architecture-app-body">
        <aside
          className={`architecture-sidebar${sidebarCollapsed ? ' architecture-sidebar-collapsed' : ''}`}
          aria-label="Studio navigation"
        >
          <nav className="architecture-sidebar-nav">
            <p className="architecture-nav-section">Studio</p>
            <Link className="architecture-nav-item" href="/cost">
              <DollarSign size={16} />
              <span>Cost Attribution</span>
            </Link>
            <span
              className="architecture-nav-item architecture-nav-item-active"
              aria-current="page"
            >
              <Layers size={16} />
              <span>Architecture</span>
            </span>

            <p className="architecture-nav-section">Model</p>
            <div className="architecture-model-summary">
              <span>
                <Boxes size={14} />
                Elements
                <strong>{workspace?.snapshot.elements.length ?? '—'}</strong>
              </span>
              <span>
                <Network size={14} />
                Relationships
                <strong>{workspace?.snapshot.relationships.length ?? '—'}</strong>
              </span>
            </div>

            <p className="architecture-nav-section">Output</p>
            <button
              type="button"
              className="architecture-nav-item architecture-nav-button"
              aria-label="Download .workspec bundle"
              disabled={workspace === null}
              onClick={downloadWorkspec}
            >
              <FileArchive size={16} />
              <span>.workspec bundle</span>
              <Download size={13} />
            </button>
            <button
              type="button"
              className="architecture-nav-item architecture-nav-button"
              aria-label="Download SVG diagrams"
              disabled={workspace === null}
              onClick={() => void downloadSvgs()}
            >
              <Network size={16} />
              <span>SVG diagrams</span>
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
            <button type="button" onClick={() => void reset()}>
              <RotateCcw size={14} />
              <span>Reset sample</span>
            </button>
            <span>Browser only · no cloud upload</span>
          </div>
        </aside>

        <main className="architecture-workspace">
          {downloadStatus !== '' && (
            <p className="architecture-toast" role="status">
              {downloadStatus}
            </p>
          )}
          {error !== null ? (
            <div className="c4-demo-error" role="alert">
              Could not load the architecture: {error}
            </div>
          ) : workspace === null ? (
            <div className="c4-demo-loading">Building the architecture model…</div>
          ) : (
            <div className="architecture-canvas" key={workspace.key}>
              <C4Explorer
                model={workspace.model}
                host={host}
                theme={theme}
                initialDiagramSlug="system-context"
                canvasChrome
                collapsibleDetails
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
