import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { flushSync } from 'react-dom';
import { C4Explorer, createInertLinkResolver } from '@workspec/c4-ui';
import type { C4StudioHost } from '@workspec/c4-ui';
import '@workspec/c4-ui/styles.css';
import { useTheme } from '@workspec/design';

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
import { WorkbenchBar } from './demo-bar.js';
import { SiteNav } from './nav.js';
import { Link } from './router.js';

const REPO_URL = 'https://github.com/FieldstateNZ/workspec-studio/tree/main/packages';
const CHECKING_ACTIVITY: ArchitectureActivity = {
  kind: 'checking',
  title: 'Connecting agent tools',
  detail: 'Checking this browser for WebMCP site-tool support.',
};

const host: C4StudioHost = {
  linkResolver: createInertLinkResolver(),
  capabilities: { editLayout: false },
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
    <div className="demo architecture-demo">
      <SiteNav
        repoUrl={REPO_URL}
        moduleName="architecture"
        moduleHref="/architecture/demo"
        ariaLabel="WorkSpec Architecture"
        extras={
          <Link className="nav-module-link" href="/cost">
            Cost Studio
          </Link>
        }
      />
      <WorkbenchBar
        crumb={
          <span className="wb-crumb-value">
            {workspace?.snapshot.system.name ?? 'Architecture Studio'}
          </span>
        }
        actions={
          <>
            <button
              type="button"
              className="wb-action wb-action-primary"
              disabled={workspace === null}
              onClick={downloadWorkspec}
            >
              Download .workspec bundle
            </button>
            <button
              type="button"
              className="wb-action"
              disabled={workspace === null}
              onClick={() => void downloadSvgs()}
            >
              Download SVGs
            </button>
            <button type="button" className="wb-action-ghost" onClick={() => void reset()}>
              Reset
            </button>
          </>
        }
      />

      <p className="demo-note" role="note">
        Everything stays in your browser. An agent can replace this sample with an architecture
        stocktake, inspect the model, and preview relationships before applying them.{' '}
        <span className="demo-blurb">
          The same validated <code>.workspec</code> source drives the canvas, YAML bundle, and SVG
          exports.
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

      {error !== null ? (
        <div className="c4-demo-error" role="alert">
          Could not load the architecture: {error}
        </div>
      ) : workspace === null ? (
        <div className="c4-demo-loading">Building the architecture model…</div>
      ) : (
        <main className="demo-stage" key={workspace.key}>
          <C4Explorer
            model={workspace.model}
            host={host}
            theme={theme}
            initialDiagramSlug="system-context"
          />
        </main>
      )}
    </div>
  );
}
