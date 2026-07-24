// The diagram canvas: grid background, the SVG edge overlay, every
// boundary box, and every node card — ported from the design's diagram
// pane. Positions come from `layoutLensTree` (authored `.layout/` positions
// where present, the deterministic fallback layout otherwise — see that
// module's comment for the mixed-position limitation). `driftBySlug`/
// `costBySlug` are the P5/P6 extension-point seams, threaded straight
// through to `NodeCard`.

import type { ReactElement } from 'react';
import { useMemo } from 'react';
import type { LensTree } from '@workspec/topology-model';
import type { ResolvedTopology } from '@workspec/topology-model';
import type { ResourceKindType } from '@workspec/topology-schema';
import { BoundaryBox } from './boundary-box.js';
import { collectEntries } from './collect-entries.js';
import { EdgeLayer } from './edge-layer.js';
import type { GhostEdge } from './edge-layer.js';
import { contentBounds, layoutLensTree } from './geometry/fallback-layout.js';
import { layoutOrphanRow } from './geometry/orphan-layout.js';
import { NodeCard } from './node-card.js';
import type { DriftClass, NodeCost } from './overlays.js';

/** One Drift-view actual-only ("orphan") resource, rendered as an extra canvas card the authored `LensTree` carries no rect for — see `drift-canvas-data.ts`'s `buildOrphanNodes`. */
export interface OrphanCanvasNode {
  readonly slug: string;
  readonly kind: ResourceKindType;
  readonly name: string;
  readonly type: string;
}

/** Props for {@link TopologyCanvas}. */
export interface TopologyCanvasProps {
  resolved: ResolvedTopology;
  tree: LensTree;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  /** P5 extension point — see `overlays.ts`. Omit for no badges. */
  driftBySlug?: Record<string, DriftClass>;
  /** P6 extension point — see `overlays.ts`. Omit for no pills. */
  costBySlug?: Record<string, NodeCost>;
  /** P5 extension point (Drift view) — actual-only resources laid out as an extra row. Omit for none. */
  orphanNodes?: readonly OrphanCanvasNode[];
  /** P5 extension point (Drift view) — mis-wired bypass edges. Omit for none. */
  ghostEdges?: readonly GhostEdge[];
  /** P6 extension point (Cost view) — formatted monthly subtotal per boundary container slug. Omit for no badges. */
  boundaryCostBySlug?: Record<string, string>;
}

const MIN_WIDTH = 640;
const MIN_HEIGHT = 420;

export function TopologyCanvas(props: TopologyCanvasProps): ReactElement {
  const {
    resolved,
    tree,
    selectedSlug,
    onSelect,
    driftBySlug,
    costBySlug,
    orphanNodes,
    ghostEdges,
    boundaryCostBySlug,
  } = props;

  const resourcesBySlug = useMemo(
    () => new Map(resolved.resources.map((resource) => [resource.slug, resource])),
    [resolved],
  );
  const authoredRects = useMemo(() => layoutLensTree(tree.roots), [tree]);
  const authoredBounds = useMemo(() => contentBounds(authoredRects), [authoredRects]);
  const orphanRects = useMemo(
    () =>
      orphanNodes && orphanNodes.length > 0
        ? layoutOrphanRow(
            authoredBounds,
            orphanNodes.map((node) => node.slug),
          )
        : null,
    [authoredBounds, orphanNodes],
  );
  const rects = useMemo(
    () => (orphanRects ? new Map([...authoredRects, ...orphanRects]) : authoredRects),
    [authoredRects, orphanRects],
  );
  const bounds = useMemo(() => contentBounds(rects), [rects]);
  const { containers, nodes } = useMemo(() => collectEntries(tree.roots), [tree]);

  const width = Math.max(bounds.width, MIN_WIDTH);
  const height = Math.max(bounds.height, MIN_HEIGHT);

  return (
    <div className="tp-canvas-viewport">
      <div className="tp-canvas" style={{ width, height }}>
        <EdgeLayer
          connections={resolved.connections}
          rects={rects}
          width={width}
          height={height}
          {...(ghostEdges !== undefined ? { ghostEdges } : {})}
        />
        {containers.map((container) => {
          const rect = rects.get(container.slug);
          if (!rect) return null;
          return (
            <BoundaryBox
              key={container.slug}
              container={container}
              rect={rect}
              {...(boundaryCostBySlug?.[container.slug] !== undefined
                ? { costLabel: boundaryCostBySlug[container.slug] }
                : {})}
            />
          );
        })}
        {nodes.map((node) => {
          const rect = rects.get(node.slug);
          const resource = resourcesBySlug.get(node.slug);
          if (!rect || !resource) return null;
          return (
            <NodeCard
              key={node.slug}
              slug={node.slug}
              kind={node.kind}
              name={node.name}
              type={resource.type}
              rect={rect}
              selected={node.slug === selectedSlug}
              onSelect={onSelect}
              {...(driftBySlug?.[node.slug] !== undefined ? { drift: driftBySlug[node.slug] } : {})}
              {...(costBySlug?.[node.slug] !== undefined ? { cost: costBySlug[node.slug] } : {})}
            />
          );
        })}
        {(orphanNodes ?? []).map((orphan) => {
          const rect = rects.get(orphan.slug);
          if (!rect) return null;
          return (
            <NodeCard
              key={orphan.slug}
              slug={orphan.slug}
              kind={orphan.kind}
              name={orphan.name}
              type={orphan.type}
              rect={rect}
              selected={orphan.slug === selectedSlug}
              onSelect={onSelect}
              drift="orphan"
            />
          );
        })}
      </div>
    </div>
  );
}
