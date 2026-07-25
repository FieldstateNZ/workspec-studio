// The top-level Topology Workbench: header (title, env/lens switchers,
// counts, and the Topology/Drift/Cost view nav) over a body (canvas + side
// panel). Owns the env/lens/view/selection UI state; the actual data comes
// from `useTopologyModel`/`useResolvedTopology`/`useLensTree` (the authored
// tree, needed by every view) plus, lazily, `useReconcile`/`useCost` (P5/P6,
// fetched only once their view is selected) — see `context.ts`. Must render
// inside a `<TopologyStudioProvider>` — that is what supplies the host, the
// QueryClient, and the theme.

import type { ReactElement, ReactNode } from 'react';
import { useState } from 'react';
import type { LensId } from '@workspec/topology-model';
import { buildBoundaryCostBySlug, buildCostBySlug } from './cost-canvas-data.js';
import { CostSidePanel } from './cost-side-panel.js';
import {
  useCost,
  useLensTree,
  useReconcile,
  useResolvedTopology,
  useTopologyModel,
} from './context.js';
import { buildDriftBySlug, buildGhostEdges, buildOrphanNodes } from './drift-canvas-data.js';
import { DriftSidePanel } from './drift-side-panel.js';
import { formatLensCounts } from './format-counts.js';
import type { DriftClass, NodeCost } from './overlays.js';
import { SidePanel } from './side-panel.js';
import { TopologyCanvas } from './topology-canvas.js';
import type { WorkbenchView } from './view-switcher.js';
import { WorkbenchHeader } from './workbench-header.js';

/** Props for {@link TopologyWorkbench}. */
export interface TopologyWorkbenchProps {
  /** Initial environment slug. Defaults to the topology's `defaultEnvironment`. */
  initialEnv?: string;
  /** Initial lens. Defaults to `'network'`. */
  initialLens?: LensId;
  /** Initial payload view. Defaults to `'topology'`. */
  initialView?: WorkbenchView;
  /** Static Topology-view overlay seam — see `overlays.ts`. Omit for no badges. Independent of the computed Drift view (which reads `useReconcile` instead). */
  driftBySlug?: Record<string, DriftClass>;
  /** Static Topology-view overlay seam — see `overlays.ts`. Omit for no pills. Independent of the computed Cost view (which reads `useCost` instead). */
  costBySlug?: Record<string, NodeCost>;
}

function Notice(props: { tone?: 'muted' | 'error'; children: ReactNode }): ReactElement {
  return (
    <div className={props.tone === 'error' ? 'tp-notice tp-notice-error' : 'tp-notice'}>
      {props.children}
    </div>
  );
}

/** A full-body notice replacing BOTH the canvas and side panel — used for the Drift/Cost views' loading/error/empty states, which have no meaningful partial canvas to show. */
function BodyNotice(props: { tone?: 'muted' | 'error'; children: ReactNode }): ReactElement {
  return (
    <div className="tp-body">
      <Notice {...(props.tone !== undefined ? { tone: props.tone } : {})}>{props.children}</Notice>
    </div>
  );
}

export function TopologyWorkbench(props: TopologyWorkbenchProps): ReactElement {
  const { initialEnv, initialLens, initialView, driftBySlug, costBySlug } = props;

  const [env, setEnv] = useState<string | null>(initialEnv ?? null);
  const [lens, setLens] = useState<LensId>(initialLens ?? 'network');
  const [view, setView] = useState<WorkbenchView>(initialView ?? 'topology');
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  const modelQuery = useTopologyModel();
  const topology = modelQuery.data?.topology ?? null;
  const effectiveEnv = env ?? topology?.topology.spec.defaultEnvironment;

  const resolvedQuery = useResolvedTopology(effectiveEnv);
  const treeQuery = useLensTree(effectiveEnv, lens);
  const reconcileQuery = useReconcile(view === 'drift' ? effectiveEnv : undefined);
  const costQuery = useCost(view === 'cost' ? effectiveEnv : undefined);

  function handleEnvChange(nextEnv: string): void {
    setEnv(nextEnv);
    // A resource can be scoped out of the newly selected environment (e.g.
    // Front Door, present only in prod) — clear the selection rather than
    // show a detail view for a resource that no longer exists here.
    setSelectedSlug(null);
  }

  function handleViewChange(nextView: WorkbenchView): void {
    setView(nextView);
    // A selection made in one view (e.g. an orphan slug, which exists only
    // in the Drift view's derived data) has no guaranteed meaning in
    // another — clear it, matching the authoritative design's own
    // `goDrift`/`goCost`/`goTopo` handlers.
    setSelectedSlug(null);
  }

  if (modelQuery.isPending) return <Notice>Loading topology…</Notice>;
  if (modelQuery.isError) {
    return <Notice tone="error">{`Could not load topology: ${modelQuery.error.message}`}</Notice>;
  }
  if (topology === null) {
    return (
      <Notice tone="error">
        No single topology found in this tree (zero, or more than one, `.workspec/topologies/*.yaml` file).
      </Notice>
    );
  }
  if (effectiveEnv === undefined) {
    return <Notice tone="error">This topology declares no environments.</Notice>;
  }
  if (resolvedQuery.isPending || treeQuery.isPending) return <Notice>Resolving…</Notice>;
  if (resolvedQuery.isError) {
    return <Notice tone="error">{`Could not resolve topology: ${resolvedQuery.error.message}`}</Notice>;
  }
  if (treeQuery.isError) {
    return <Notice tone="error">{`Could not build lens tree: ${treeQuery.error.message}`}</Notice>;
  }
  const resolved = resolvedQuery.data;
  const tree = treeQuery.data;
  if (!resolved || !tree) return <Notice>Resolving…</Notice>;

  let body: ReactElement;
  if (view === 'drift') {
    if (reconcileQuery.isPending) {
      body = <BodyNotice>Reconciling…</BodyNotice>;
    } else if (reconcileQuery.isError) {
      body = <BodyNotice tone="error">{`Could not reconcile: ${reconcileQuery.error.message}`}</BodyNotice>;
    } else if (!reconcileQuery.data) {
      body = (
        <BodyNotice>
          No actual state imported for this environment — run `workspec-topology import` to reconcile
          against a deployed estate.
        </BodyNotice>
      );
    } else {
      const result = reconcileQuery.data;
      body = (
        <div className="tp-body">
          <TopologyCanvas
            resolved={resolved}
            tree={tree}
            selectedSlug={selectedSlug}
            onSelect={setSelectedSlug}
            driftBySlug={buildDriftBySlug(result.drifts)}
            orphanNodes={buildOrphanNodes(result.derived, result.drifts)}
            ghostEdges={buildGhostEdges(result.drifts)}
          />
          <DriftSidePanel
            resolved={resolved}
            result={result}
            selectedSlug={selectedSlug}
            onSelect={setSelectedSlug}
            onClearSelection={() => setSelectedSlug(null)}
          />
        </div>
      );
    }
  } else if (view === 'cost') {
    if (costQuery.isPending) {
      body = <BodyNotice>Pricing…</BodyNotice>;
    } else if (costQuery.isError) {
      body = <BodyNotice tone="error">{`Could not price topology: ${costQuery.error.message}`}</BodyNotice>;
    } else if (!costQuery.data) {
      body = (
        <BodyNotice>
          No cost catalog configured for this tree — the host has not supplied one yet.
        </BodyNotice>
      );
    } else {
      const result = costQuery.data;
      const currency = result.catalog.spec.currency;
      body = (
        <div className="tp-body">
          <TopologyCanvas
            resolved={resolved}
            tree={tree}
            selectedSlug={selectedSlug}
            onSelect={setSelectedSlug}
            costBySlug={buildCostBySlug(result.cost, currency)}
            boundaryCostBySlug={buildBoundaryCostBySlug(result.cost, lens, currency)}
          />
          <CostSidePanel
            resolved={resolved}
            result={result}
            selectedSlug={selectedSlug}
            onSelect={setSelectedSlug}
            onClearSelection={() => setSelectedSlug(null)}
          />
        </div>
      );
    }
  } else {
    body = (
      <div className="tp-body">
        <TopologyCanvas
          resolved={resolved}
          tree={tree}
          selectedSlug={selectedSlug}
          onSelect={setSelectedSlug}
          {...(driftBySlug !== undefined ? { driftBySlug } : {})}
          {...(costBySlug !== undefined ? { costBySlug } : {})}
        />
        <SidePanel
          resolved={resolved}
          tree={tree}
          lens={lens}
          selectedSlug={selectedSlug}
          onSelect={setSelectedSlug}
          onClearSelection={() => setSelectedSlug(null)}
        />
      </div>
    );
  }

  return (
    <div className="tp-workbench">
      <WorkbenchHeader
        slug={topology.slug}
        title={resolved.title}
        environments={topology.topology.spec.environments}
        env={effectiveEnv}
        onEnvChange={handleEnvChange}
        lens={lens}
        onLensChange={setLens}
        counts={formatLensCounts(tree.counts)}
        view={view}
        onViewChange={handleViewChange}
      />
      {body}
    </div>
  );
}
