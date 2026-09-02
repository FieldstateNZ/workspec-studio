// The interactive C4 canvas — since S4 (#120) a FACADE over the shared
// canvas engine: `@workspec/canvas` (store/camera/pointer pipeline +
// orthogonal edge router) composed with the in-package C4 layer
// (`./c4/` — the ResolvedDiagram→shape projection and the enterprise
// node/boundary chrome, folded in from @workspec/canvas-c4 by ADR i).
// Externally props-compatible with the previous SVG renderer:
// same `C4DiagramProps`, same interaction contract (click activates =
// onSelect + onNavigate; node drag-to-pin writes `.layout/` through the
// host and never activates; background click clears the selection;
// background drag pans; wheel zooms; arrows/+/-/Escape on the container),
// same a11y surface (role="button" nodes with `${kind}: ${title}` labels,
// Enter to activate). The rendering DOM changed (enterprise HTML cards +
// screen-space edge SVG instead of one stretched viewBox) — and the old
// `preserveAspectRatio='none'` stretch model is replaced by the enterprise
// camera (no distortion, zoom clamped 0.1–4): see CHANGELOG.md.

import type { CSSProperties, FC, KeyboardEvent, ReactElement } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { LoadedElement, ResolvedDiagram } from '@workspec/c4-model';
import type { LayoutDirection, PositionedDiagram, PositionedNode } from '@workspec/c4-layout';
import { layoutPathFor, serializeLayout } from '@workspec/c4-schema';
import type { Spec } from '@workspec/c4-schema';
import {
  Canvas,
  Background,
  CanvasZoomControls,
  CanvasProvider,
  CanvasSpecContext,
  ConnectorLayer,
  Minimap,
  ShapeLayer,
  createCanvasStore,
  pageToScreen,
  useCanvasHover,
  useCanvasStore,
  useCanvasViewport,
} from '@workspec/canvas';
import type { CanvasStoreInstance, ShapeId } from '@workspec/canvas';
import {
  buildC4Shapes,
  buildCanvasSpec,
  fitCamera,
  nodeShapeId,
  registerC4,
  type C4NodeShape,
} from './c4/index.js';
import { serializeForWrite } from './drag/serialize-for-write.js';
import { clampTooltipPercents } from './geometry/clamp-tooltip.js';
import { createInertLinkResolver } from './host.js';
import type { C4StudioHost, LinkResolver } from './host.js';
import { ThemedRoot } from './themed-root.js';
import { tooltipContentFor, TooltipContent } from './tooltip.js';
import type { ThemeName } from './themes.js';
import { A11yBridgeContext, a11yC4NodeShapeUtil, type A11yBridge } from './c4-canvas/a11y-node.js';
import { createFacadeTool } from './c4-canvas/facade-tool.js';

export interface C4DiagramProps {
  /** The positioned view to render — one `layoutDiagram` result (one lens, or the sole view). */
  diagram: PositionedDiagram;
  /** The resolved diagram this view belongs to — supplies slug/layout context for the drag-to-pin write path. */
  resolved: ResolvedDiagram;
  /** The loaded style spec, if any — accent/shape/variant overrides. Omit to render with the Enterprise defaults. */
  spec?: Spec | undefined;
  /** The embedding host: layout write-back source, link resolution, capabilities. Omit for a fully read-only, host-less render. */
  host?: C4StudioHost | undefined;
  /** Called when the user drills down on a node with a resolved slug (click, or Enter while focused). */
  onNavigate?: ((diagramSlug: string) => void) | undefined;
  /** The persistently-selected node's `nodeId` (accent ring), or null/omitted for none — the caller owns selection state. */
  selectedNodeId?: string | null | undefined;
  /** Called when the user activates a node (click/Enter) with that node, or clicks the background (with null). */
  onSelect?: ((node: PositionedNode | null) => void) | undefined;
  /** Elements keyed by `elementKey(kind, slug)`, for the hover tooltip's Links section. */
  elementsByKindAndSlug?: ReadonlyMap<string, LoadedElement> | undefined;
  /** Layout flow direction the positions were produced with. Defaults to `'LR'`. (Advisory since S4 — edge routes are recomputed live by the shared router.) */
  direction?: LayoutDirection | undefined;
  theme?: ThemeName | undefined;
  className?: string | undefined;
  /** Show camera-aligned grid, zoom controls, and minimap from the shared infinite canvas. */
  canvasChrome?: boolean | undefined;
}

const PAN_STEP = 40;
const ZOOM_FACTOR = 1.2;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;

const MINIMAP_KIND_COLORS: Record<string, string> = {
  actor: 'var(--el-actor)',
  system: 'var(--el-system)',
  'external-system': 'var(--el-external-system)',
  container: 'var(--el-container)',
  component: 'var(--type-feature)',
  domain: 'var(--el-domain)',
  database: 'var(--el-database)',
  queue: 'var(--el-queue)',
};

/** Zoom the camera about a canvas-relative screen point by `factor`, clamped 0.1–4. */
function zoomCamera(
  camera: { x: number; y: number; zoom: number },
  screenX: number,
  screenY: number,
  factor: number,
): { x: number; y: number; zoom: number } {
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, camera.zoom * factor));
  const pageX = screenX / camera.zoom + camera.x;
  const pageY = screenY / camera.zoom + camera.y;
  return { zoom, x: pageX - screenX / zoom, y: pageY - screenY / zoom };
}

/** The hover tooltip, anchored to the hovered node in screen space and clamped inside the canvas. */
const TooltipOverlay: FC<{
  nodesById: ReadonlyMap<string, PositionedNode>;
  elementsByKindAndSlug: ReadonlyMap<string, LoadedElement> | undefined;
  linkResolver: LinkResolver;
}> = ({ nodesById, elementsByKindAndSlug, linkResolver }) => {
  const camera = useCanvasStore((s) => s.camera);
  const shapes = useCanvasStore((s) => s.shapes);
  const hoveredId = useCanvasHover((s) => s.hoveredId);
  const viewport = useCanvasViewport();

  const shape = hoveredId !== null ? shapes[hoveredId] : undefined;
  if (!shape || shape.type !== 'c4node') return null;
  const node = nodesById.get((shape as C4NodeShape).slug);
  if (!node) return null;

  const screen = pageToScreen({ x: shape.x, y: shape.y }, camera);
  const w = viewport && viewport.width > 0 ? viewport.width : 1;
  const h = viewport && viewport.height > 0 ? viewport.height : 1;
  const clamped = clampTooltipPercents((screen.x / w) * 100, (screen.y / h) * 100);
  return (
    <div
      className="c4-tooltip"
      data-canvas-ui
      style={{
        position: 'absolute',
        left: `${String(clamped.left)}%`,
        top: `${String(clamped.top)}%`,
      }}
    >
      <TooltipContent
        content={tooltipContentFor(node, elementsByKindAndSlug)}
        linkResolver={linkResolver}
      />
    </div>
  );
};

export function C4Diagram(props: C4DiagramProps): ReactElement {
  const {
    diagram,
    resolved,
    spec,
    host,
    onNavigate,
    selectedNodeId = null,
    onSelect,
    elementsByKindAndSlug,
    direction = 'LR',
    theme,
    className,
    canvasChrome = false,
  } = props;
  void direction; // positions are authoritative; the shared router recomputes edge look live

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);

  const editable = Boolean(host?.capabilities.editLayout && host.source);

  // Latest-props refs so the ONE registered tool/a11y bridge always sees
  // current callbacks and data without re-registration.
  const latest = useRef({ diagram, resolved, host, onNavigate, onSelect, editable });
  latest.current = { diagram, resolved, host, onNavigate, onSelect, editable };

  const nodesById = useMemo(
    () => new Map(diagram.nodes.map((n) => [n.nodeId, n] as const)),
    [diagram],
  );
  const nodesByIdRef = useRef(nodesById);
  nodesByIdRef.current = nodesById;

  const [instance] = useState<CanvasStoreInstance>(() => {
    const inst = createCanvasStore();
    registerC4(inst);
    // The facade's a11y wrapper replaces the raw card Component; the facade
    // tool replaces the whiteboard select tool (see c4-canvas/facade-tool.ts
    // for the contract it preserves).
    inst.shapeUtils.register(a11yC4NodeShapeUtil);
    inst.tools.register(
      createFacadeTool(inst, {
        isEditable: () => latest.current.editable,
        onActivateNode: (shapeId) => {
          activateRef.current(shapeId);
        },
        onBackgroundClick: () => {
          latest.current.onSelect?.(null);
        },
        onDragCommit: () => {
          writeLayoutRef.current();
        },
      }),
    );
    return inst;
  });
  useEffect(() => () => instance.dispose(), [instance]);

  /** Click/Enter activation: onSelect always, onNavigate only for a resolved slug. */
  const activateRef = useRef((shapeId: ShapeId) => {
    void shapeId;
  });
  activateRef.current = (shapeId: ShapeId) => {
    const shape = instance.getState().shapes[shapeId];
    if (!shape || shape.type !== 'c4node') return;
    const node = nodesByIdRef.current.get((shape as C4NodeShape).slug);
    if (!node) return;
    latest.current.onSelect?.(node);
    if (node.slug !== null) latest.current.onNavigate?.(node.slug);
  };

  /** The drag-to-pin write path: current node positions merged into the shared `.layout/` file. */
  const writeLayoutRef = useRef((): void => undefined);
  writeLayoutRef.current = () => {
    const { host: h, resolved: r, diagram: d } = latest.current;
    if (!h?.source) return;
    const shapes = instance.getState().shapes;
    const positioned: PositionedDiagram = {
      nodes: d.nodes.map((n) => {
        const s = shapes[nodeShapeId(n.nodeId)];
        return s ? { ...n, x: s.x, y: s.y } : n;
      }),
      edges: d.edges,
    };
    const merged = serializeForWrite(r.layout?.data ?? null, positioned);
    h.source
      .writeFile(layoutPathFor(r.slug), serializeLayout(merged))
      .catch((error: unknown) =>
        setWriteError(error instanceof Error ? error.message : String(error)),
      );
  };

  // Projection: a new diagram prop (fresh layout / lens / diagram switch)
  // re-projects the POSITIONED view (the caller's layout + lens choice is
  // authoritative — the synthetic single-view resolved guarantees the
  // projection can never disagree with what the caller laid out), resets
  // the camera, and frames the content with the enterprise fit (1× cap).
  useEffect(() => {
    const synthetic: ResolvedDiagram = {
      ...resolved,
      // The caller's PositionedDiagram is ALREADY the chosen lens view —
      // the projection must not re-partition it, so a c4-container type is
      // masked (buildC4Shapes's lens filter only bites on 'c4-container';
      // the type string feeds nothing else in the projection).
      type: resolved.type === 'c4-container' ? 'c4-container(positioned-view)' : resolved.type,
      view: { nodes: diagram.nodes, edges: diagram.edges },
      lensViews: null,
    };
    // Placements carry the laid-out width/height too, so a `.layout/`
    // pinned-size node renders at its pin size AND its edges anchor to the
    // real card faces (S4 fix round — sizes were previously discarded).
    const positions = Object.fromEntries(
      diagram.nodes.map(
        (n) => [n.nodeId, { x: n.x, y: n.y, width: n.width, height: n.height }] as const,
      ),
    );
    const projection = buildC4Shapes(synthetic, { positions });
    instance.getState()._setShapesRaw(projection.shapes);

    const rect = containerRef.current?.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0 && projection.bounds) {
      instance.getState().setCamera(fitCamera(projection.bounds, rect.width, rect.height));
    } else {
      instance.getState().setCamera({ x: 0, y: 0, zoom: 1 });
    }
  }, [diagram, resolved, instance]);

  // Controlled selection: the caller owns it; the store halo follows.
  useEffect(() => {
    const store = instance.getState();
    if (selectedNodeId !== null && nodesById.has(selectedNodeId)) {
      store.select([nodeShapeId(selectedNodeId)], 'replace');
    } else {
      store.clearSelection();
    }
  }, [selectedNodeId, nodesById, instance]);

  // Wheel = zoom about the cursor (the shipped c4-ui contract; the
  // whiteboard's wheel-pans/ctrl-zooms stays a whiteboard behaviour).
  // Native capture listener so the engine's own wheel handler never runs.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: globalThis.WheelEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      const rect = el.getBoundingClientRect();
      const factor = e.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
      const store = instance.getState();
      store.setCamera(
        zoomCamera(store.camera, e.clientX - rect.left, e.clientY - rect.top, factor),
      );
    };
    el.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => {
      el.removeEventListener('wheel', onWheel, { capture: true });
    };
  }, [instance]);

  function onContainerKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const store = instance.getState();
    const camera = store.camera;
    const rect = containerRef.current?.getBoundingClientRect();
    const cx = (rect?.width ?? 0) / 2;
    const cy = (rect?.height ?? 0) / 2;
    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault();
        store.setCamera({ ...camera, y: camera.y - PAN_STEP / camera.zoom });
        break;
      case 'ArrowDown':
        event.preventDefault();
        store.setCamera({ ...camera, y: camera.y + PAN_STEP / camera.zoom });
        break;
      case 'ArrowLeft':
        event.preventDefault();
        store.setCamera({ ...camera, x: camera.x - PAN_STEP / camera.zoom });
        break;
      case 'ArrowRight':
        event.preventDefault();
        store.setCamera({ ...camera, x: camera.x + PAN_STEP / camera.zoom });
        break;
      case '+':
      case '=':
        event.preventDefault();
        store.setCamera(zoomCamera(camera, cx, cy, ZOOM_FACTOR));
        break;
      case '-':
      case '_':
        event.preventDefault();
        store.setCamera(zoomCamera(camera, cx, cy, 1 / ZOOM_FACTOR));
        break;
      case 'Escape':
        store.clearSelection();
        onSelect?.(null);
        break;
      default:
        break;
    }
  }

  const canvasSpec = useMemo(() => buildCanvasSpec(spec), [spec]);
  const linkResolver = useMemo(
    () => host?.linkResolver ?? createInertLinkResolver(),
    [host?.linkResolver],
  );
  const bridge = useMemo<A11yBridge>(
    () => ({
      nodesById,
      isInteractive: (node) => node.slug !== null || onSelect !== undefined,
      onActivate: (shapeId) => {
        activateRef.current(shapeId);
      },
    }),
    [nodesById, onSelect],
  );

  return (
    <ThemedRoot theme={theme} className={className}>
      <div
        ref={containerRef}
        className="c4-diagram"
        data-layout-editable={editable}
        tabIndex={0}
        onKeyDown={onContainerKeyDown}
        aria-label={`${resolved.title} diagram`}
        style={{ position: 'relative' } as CSSProperties}
      >
        {writeError !== null && (
          <div className="c4-write-error" role="alert">
            {`Could not save layout: ${writeError}`}
          </div>
        )}
        {/* Absolute inset so the canvas fills .c4-diagram however its height
            arose (host-sized chain OR the min-height fallback) — percentage
            heights don't resolve against min-height alone. */}
        <div style={{ position: 'absolute', inset: 0 }}>
          <CanvasProvider store={instance}>
            <CanvasSpecContext.Provider value={canvasSpec}>
              <A11yBridgeContext.Provider value={bridge}>
                <Canvas shortcutScope="none" renderContextMenu={() => null}>
                  {canvasChrome && <Background variant="lines" />}
                  <ConnectorLayer />
                  <ShapeLayer />
                  {canvasChrome && (
                    <>
                      <CanvasZoomControls />
                      <Minimap kindColors={MINIMAP_KIND_COLORS} />
                    </>
                  )}
                  <TooltipOverlay
                    nodesById={nodesById}
                    elementsByKindAndSlug={elementsByKindAndSlug}
                    linkResolver={linkResolver}
                  />
                </Canvas>
              </A11yBridgeContext.Provider>
            </CanvasSpecContext.Provider>
          </CanvasProvider>
        </div>
      </div>
    </ThemedRoot>
  );
}
