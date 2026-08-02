import type {
  Box,
  Camera,
  Shape,
  ShapeId,
} from '@workspec/canvas';
import { generateKeyBetween } from '@workspec/canvas';
import type {
  ResolvedDiagram,
  ResolvedDiagramEdge,
  ResolvedDiagramNode,
  ResolvedDiagramView,
} from '@workspec/c4-model';
import type { C4BoundaryShape, C4NodeShape } from './c4-types.js';
import { C4_NODE_HEIGHT, C4_NODE_WIDTH } from './shapes/c4-node-shape-util.js';
import {
  C4_BOUNDARY_DEFAULT_H,
  C4_BOUNDARY_DEFAULT_W,
  C4_BOUNDARY_PAD,
} from './shapes/c4-boundary-shape-util.js';

// The ResolvedDiagram → canvas-shape projection, ported from the enterprise
// `c4/projectModel.ts` buildShapes (#119). The projection itself —
// lens/level inside-sets, lane-offset/fan-role precompute, z-banding,
// boundary derivation, deterministic ids, meta protocol — is verbatim; the
// input is the STUDIO model (`ResolvedDiagram`, see the field-mapping table
// in the S3 report) and positioning moved out entirely: the enterprise's
// internal dagre-fresh/seat-incremental paths are superseded by
// @workspec/c4-layout's elk pin-merge (see layout.ts), so `buildC4Shapes`
// is pure and synchronous over caller-supplied positions.

// Node kinds that always live OUTSIDE the system boundary (they interact
// with the system but aren't part of it).
const ALWAYS_OUTSIDE = new Set(['actor', 'external-system']);

// The kinds that sit INSIDE the boundary at each level. At the container
// level the set depends on the lens (logical = domains; deployment =
// infra). Used to size the boundary.
const LOGICAL_INSIDE = new Set(['domain']);
const DEPLOYMENT_INSIDE = new Set(['container', 'component', 'database', 'queue']);
const COMPONENT_INSIDE = new Set(['component', 'feature']);
const CODE_INSIDE = new Set(['class', 'interface', 'function']);

export type C4Lens = 'logical' | 'deployment';
export type C4BoundaryLevel = 'container' | 'component' | 'code';

export function insideTypesFor(level: C4BoundaryLevel, lens: C4Lens): Set<string> {
  if (level === 'code') return CODE_INSIDE;
  if (level === 'component') return COMPONENT_INSIDE;
  return lens === 'deployment' ? DEPLOYMENT_INSIDE : LOGICAL_INSIDE;
}

export interface BoundaryOpts {
  level: C4BoundaryLevel;
  label: string;
  accent: string;
}

// Deterministic ShapeIds keyed by model identity so re-projection (after a
// refetch or lens toggle) updates shapes in place — no remount flicker, and
// selection survives. Optimistic-add paths use the same helpers so the
// optimistic shape and its reconciled twin share an id.
export const nodeShapeId = (slug: string): ShapeId => `c4n_${slug}` as ShapeId;
export const edgeShapeId = (from: string, to: string): ShapeId =>
  `c4e_${from}__${to}` as ShapeId;

export interface ProjectionResult {
  shapes: Record<ShapeId, Shape>;
  /** node id → ShapeId. Includes '__system__' aliased to the system node. */
  slugToShapeId: Record<string, ShapeId>;
  /** AABB of all node shapes in page coords (null when no nodes). */
  bounds: Box | null;
}

/**
 * One node's authoritative placement: top-left position plus (optionally)
 * its pinned size. `.layout/` pins may carry per-node `width`/`height`
 * (see `@workspec/c4-schema`'s `LayoutNode`); a placement omitting them
 * renders at the default `C4_NODE_WIDTH`×`C4_NODE_HEIGHT` footprint. A
 * plain `Vec2` is assignable, so position-only callers are unchanged.
 */
export interface NodePlacement {
  readonly x: number;
  readonly y: number;
  readonly width?: number;
  readonly height?: number;
}

export interface BuildC4ShapesOptions {
  /** Which container-level lens to project (also selects `lensViews` when present). Default 'logical'. */
  lens?: C4Lens;
  /**
   * Authoritative node placements keyed by nodeId — normally the output of
   * layout.ts's elk layout (or a host's saved layout), including any pinned
   * per-node size (S4 fix round: sizes are NOT discarded — a pinned-size
   * node's card AND its edge anchors both use the pinned rect). A node
   * missing here falls back to its inline authored `position` (default
   * size), then (0,0).
   */
  positions?: Record<string, NodePlacement>;
  /** Nodes with a deeper diagram (ROOM + drill buttons). */
  drillableSlugs?: Set<string>;
  /** Renders the derived boundary panel + outside/inside z-banding. */
  boundary?: BoundaryOpts;
  /** Nodes with uncommitted draft-branch changes (DRAFT chip). */
  draftedSlugs?: Set<string>;
  /** Rework flags per nodeId (halo + footer toggle). */
  reworkingMap?: Map<string, { reworking: boolean; canvasObjectId: string }>;
  /** The view's in-scope subject (data-scope="focus" tint). */
  scopeSlug?: string;
}

/** The view a projection reads: `lensViews[lens]` for lens-partitioned diagrams, else `view`. */
export function viewFor(resolved: ResolvedDiagram, lens: C4Lens): ResolvedDiagramView {
  if (resolved.lensViews) return resolved.lensViews[lens];
  return resolved.view ?? { nodes: [], edges: [] };
}

function kindOf(node: ResolvedDiagramNode): string {
  return node.kind ?? 'unknown';
}

function filterEdgesByLens(
  edges: readonly ResolvedDiagramEdge[],
  diagramType: string,
  lens: C4Lens,
): ResolvedDiagramEdge[] {
  if (diagramType !== 'c4-container') return [...edges];
  return edges.filter((e) => {
    const tag = e.lens ?? 'both';
    return tag === 'both' || tag === lens;
  });
}

/**
 * Builds canvas shapes from a resolved diagram. Every shape is flagged
 * `meta.ephemeral` so the store's persistence layer never leaks C4 shapes
 * into whiteboard snapshots.
 */
export function buildC4Shapes(
  resolved: ResolvedDiagram,
  options: BuildC4ShapesOptions = {},
): ProjectionResult {
  const lens = options.lens ?? 'logical';
  const view = viewFor(resolved, lens);

  // The container level is lens-partitioned: logical shows domains,
  // deployment shows infra (containers/databases/queues). Structural
  // context — actors, external systems, the system itself — shows under
  // both. (Idempotent over `lensViews`, which arrive pre-partitioned.)
  const allNodes = view.nodes;
  const nodesIn =
    options.boundary?.level === 'container'
      ? allNodes.filter(
          (n) =>
            ALWAYS_OUTSIDE.has(kindOf(n)) ||
            kindOf(n) === 'system' ||
            insideTypesFor('container', lens).has(kindOf(n)),
        )
      : [...allNodes];

  // Placement resolution: caller placements (position + optional pinned
  // size) → the node's inline authored pin → origin. (The enterprise
  // dagre-fresh/seat-incremental fallbacks live in @workspec/c4-layout now
  // — see the file header.) Size falls back to the shared default dims,
  // which S3's alignment invariant keeps identical to @workspec/c4-layout's.
  const positions: Record<string, NodePlacement> = {};
  for (const n of nodesIn) {
    positions[n.nodeId] = options.positions?.[n.nodeId] ?? n.position ?? { x: 0, y: 0 };
  }
  const widthOf = (nodeId: string): number => positions[nodeId]?.width ?? C4_NODE_WIDTH;
  const heightOf = (nodeId: string): number => positions[nodeId]?.height ?? C4_NODE_HEIGHT;

  const edges = filterEdgesByLens(view.edges, resolved.type, lens).filter((e) => !e.dangling);

  // Lane offsets + fan roles so parallel edges sharing an endpoint spread
  // instead of stacking. Verbatim enterprise precompute.
  const LANE_SPACING = 14;
  const FAN_THRESHOLD = 2;
  const byTarget = new Map<string, ResolvedDiagramEdge[]>();
  const bySource = new Map<string, ResolvedDiagramEdge[]>();
  for (const e of edges) {
    const tArr = byTarget.get(e.to) ?? [];
    tArr.push(e);
    byTarget.set(e.to, tArr);
    const sArr = bySource.get(e.from) ?? [];
    sArr.push(e);
    bySource.set(e.from, sArr);
  }
  const laneOffsets = new Map<string, number>();
  for (const [, group] of byTarget) {
    // Stack incoming edges top→bottom by their source's vertical position,
    // so the lanes enter the target in the order their sources sit and
    // don't cross on the approach. Deterministic tie-break on slug.
    const ordered = [...group].sort((a, b) => {
      const ay = positions[a.from]?.y ?? 0;
      const by = positions[b.from]?.y ?? 0;
      if (ay !== by) return ay - by;
      return a.from < b.from ? -1 : a.from > b.from ? 1 : 0;
    });
    const n = ordered.length;
    ordered.forEach((e, idx) => {
      laneOffsets.set(`${e.from}->${e.to}`, (idx - (n - 1) / 2) * LANE_SPACING);
    });
  }
  const fanRoles = new Map<string, 'source-fan' | 'target-fan' | 'balanced'>();
  for (const e of edges) {
    const out = bySource.get(e.from)?.length ?? 0;
    const inn = byTarget.get(e.to)?.length ?? 0;
    const role =
      out >= FAN_THRESHOLD && out > inn
        ? 'source-fan'
        : inn >= FAN_THRESHOLD && inn > out
          ? 'target-fan'
          : 'balanced';
    fanRoles.set(`${e.from}->${e.to}`, role);
  }

  // Shape z-order, painted back → front as one ascending fractional-index
  // sequence: outside nodes < boundary panel < connectors < inside nodes.
  // So the boundary sits IN FRONT of actors/externals (context, not
  // contents) and BEHIND the nodes it contains. Hit-testing runs
  // front-to-back, so inside nodes win over the boundary, which wins over
  // outside nodes. Without a boundary this collapses to the historical
  // connectors < nodes.
  const isOutside = (t: string): boolean => !!options.boundary && ALWAYS_OUTSIDE.has(t);
  let prevIdx: string | null = null;
  const nodeIndex = new Map<string, string>();
  for (const n of nodesIn) {
    if (!isOutside(kindOf(n))) continue;
    prevIdx = generateKeyBetween(prevIdx, null);
    nodeIndex.set(n.nodeId, prevIdx);
  }
  const boundaryIndex = options.boundary ? (prevIdx = generateKeyBetween(prevIdx, null)) : null;
  const connectorKeys: string[] = [];
  for (const _edge of edges) {
    void _edge;
    prevIdx = generateKeyBetween(prevIdx, null);
    connectorKeys.push(prevIdx);
  }
  for (const n of nodesIn) {
    if (isOutside(kindOf(n))) continue;
    prevIdx = generateKeyBetween(prevIdx, null);
    nodeIndex.set(n.nodeId, prevIdx);
  }

  const shapes: Record<ShapeId, Shape> = {};
  const slugToShapeId: Record<string, ShapeId> = {};
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const n of nodesIn) {
    const id = nodeShapeId(n.nodeId);
    const pos = positions[n.nodeId] ?? { x: 0, y: 0 };
    const node: C4NodeShape = {
      id,
      type: 'c4node',
      index: nodeIndex.get(n.nodeId) ?? generateKeyBetween(prevIdx, null),
      x: pos.x,
      y: pos.y,
      width: widthOf(n.nodeId),
      height: heightOf(n.nodeId),
      slug: n.nodeId,
      nodeType: kindOf(n),
      label: n.title,
      description: n.description ?? undefined,
      drillable: options.drillableSlugs?.has(n.nodeId) ?? false,
      drafted: options.draftedSlugs?.has(n.nodeId) ?? false,
      reworking: options.reworkingMap?.get(n.nodeId)?.reworking ?? false,
      canvasObjectId: options.reworkingMap?.get(n.nodeId)?.canvasObjectId ?? null,
      ...(options.scopeSlug !== undefined && options.scopeSlug === n.nodeId
        ? { isScope: true }
        : {}),
      meta: {
        ephemeral: true,
        slug: n.nodeId,
        // The RESOLVED element slug (distinct from nodeId for fat/aliased
        // nodes) rides along for hosts mapping back to elements (#119).
        ...(n.slug !== null && n.slug !== n.nodeId ? { elementSlug: n.slug } : {}),
        ...(n.technology !== null ? { technology: n.technology } : {}),
        ...(n.tags.length > 0 ? { tags: n.tags } : {}),
        ...(n.injected ? { injected: true } : {}),
        ...(n.dangling ? { dangling: true } : {}),
      },
    };
    shapes[id] = node;
    slugToShapeId[n.nodeId] = id;
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + node.width);
    maxY = Math.max(maxY, pos.y + node.height);
  }

  // '__system__' DSL alias resolves to whichever node carries the system kind.
  if (!slugToShapeId['__system__']) {
    const systemNode = nodesIn.find((n) => kindOf(n) === 'system');
    if (systemNode) {
      const sid = slugToShapeId[systemNode.nodeId];
      if (sid) slugToShapeId['__system__'] = sid;
    }
  }

  edges.forEach((e, i) => {
    const sourceShapeId = slugToShapeId[e.from];
    const targetShapeId = slugToShapeId[e.to];
    if (!sourceShapeId || !targetShapeId) return; // endpoint not in this diagram
    const id = edgeShapeId(e.from, e.to);
    const key = `${e.from}->${e.to}`;
    shapes[id] = {
      id,
      type: 'connector',
      index: connectorKeys[i] ?? generateKeyBetween(prevIdx, null),
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      sourceShapeId,
      targetShapeId,
      edgeFrom: e.from,
      edgeTo: e.to,
      ...(e.label !== null ? { label: e.label } : {}),
      ...(e.category !== null ? { category: e.category } : {}),
      ...(e.lens !== null ? { lens: e.lens } : {}),
      laneOffset: laneOffsets.get(key) ?? 0,
      fanRole: fanRoles.get(key) ?? 'balanced',
      meta: { ephemeral: true },
    };
  });

  // ── System boundary (container/component/code levels) ───────────────────
  // A semi-transparent enclosing panel around the inside-the-system nodes,
  // sized to the bbox of the inside kinds only (actors/externals stay
  // outside) plus padding.
  let boundaryRect: Box | null = null;
  if (options.boundary) {
    const inside = insideTypesFor(options.boundary.level, lens);
    let bMinX = Infinity;
    let bMinY = Infinity;
    let bMaxX = -Infinity;
    let bMaxY = -Infinity;
    let insideCount = 0;
    for (const n of nodesIn) {
      if (!inside.has(kindOf(n))) continue;
      const p = positions[n.nodeId] ?? { x: 0, y: 0 };
      insideCount++;
      // Tag contained nodes so a host's live reflow can recompute the panel
      // box from its contents as they're dragged, not just on refetch.
      const s = shapes[nodeShapeId(n.nodeId)];
      if (s) s.meta = { ...(s.meta ?? {}), inBoundary: true };
      bMinX = Math.min(bMinX, p.x);
      bMinY = Math.min(bMinY, p.y);
      bMaxX = Math.max(bMaxX, p.x + widthOf(n.nodeId));
      bMaxY = Math.max(bMaxY, p.y + heightOf(n.nodeId));
    }

    let bx: number;
    let by: number;
    let bw: number;
    let bh: number;
    if (insideCount > 0) {
      bx = bMinX - C4_BOUNDARY_PAD;
      by = bMinY - C4_BOUNDARY_PAD;
      bw = bMaxX - bMinX + C4_BOUNDARY_PAD * 2;
      bh = bMaxY - bMinY + C4_BOUNDARY_PAD * 2;
    } else {
      // Empty interior — a minimum visible footprint centred on the node
      // centroid (or the origin), so the container stays a usable "drop
      // things here" target.
      const placed = Object.values(positions);
      const cx = placed.length ? placed.reduce((s, p) => s + p.x, 0) / placed.length : 0;
      const cy = placed.length ? placed.reduce((s, p) => s + p.y, 0) / placed.length : 0;
      bw = C4_BOUNDARY_DEFAULT_W;
      bh = C4_BOUNDARY_DEFAULT_H;
      bx = cx - bw / 2;
      by = cy - bh / 2;
    }

    // Indexed (with the z-bands above) between the outside nodes and the
    // connectors: in front of context, behind contents.
    const boundaryShape: C4BoundaryShape = {
      id: 'c4_boundary' as ShapeId,
      type: 'c4boundary',
      index: boundaryIndex ?? generateKeyBetween(prevIdx, null),
      x: bx,
      y: by,
      width: bw,
      height: bh,
      label: options.boundary.label,
      accent: options.boundary.accent,
      meta: { ephemeral: true },
    };
    shapes[boundaryShape.id] = boundaryShape;
    boundaryRect = { x: bx, y: by, width: bw, height: bh };
  }

  // Camera-fit bounds. Prefer the node bbox; when there are no nodes but a
  // boundary exists (an empty container/component/code view), frame the
  // boundary so the "drop things here" target is centred instead of
  // stranded at the origin.
  const bounds: Box | null =
    nodesIn.length > 0
      ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
      : boundaryRect;

  return { shapes, slugToShapeId, bounds };
}

// Camera that frames `bounds` within a viewport of vw×vh, capped at 1× zoom.
export function fitCamera(bounds: Box | null, vw: number, vh: number, pad = 100): Camera {
  if (!bounds || bounds.width === 0 || bounds.height === 0) {
    return { x: 0, y: 0, zoom: 1 };
  }
  const zoom = Math.max(
    0.1,
    Math.min(1, (vw - pad * 2) / bounds.width, (vh - pad * 2) / bounds.height),
  );
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  return { x: cx - vw / 2 / zoom, y: cy - vh / 2 / zoom, zoom };
}
