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
  Background,
  Canvas,
  CanvasProvider,
  CanvasSpecContext,
  CanvasZoomControls,
  ConnectorLayer,
  ContextMenu,
  Minimap,
  ShapeLayer,
  createCanvasStore,
  createConnectorTool,
  createPlaceTool,
  pageToScreen,
  useCanvasHover,
  useCanvasStore,
  useCanvasViewport,
} from '@workspec/canvas';
import type { BackgroundVariant, CanvasStoreInstance, ShapeId } from '@workspec/canvas';
import {
  buildC4Shapes,
  buildCanvasSpec,
  fitCamera,
  nodeShapeId,
  registerC4,
  type C4Lens,
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
import { C4ContextMenuExtras } from './c4-canvas/c4-context-menu-extras.js';
import { paletteForDiagram } from './c4-canvas/c4-palette.js';
import { C4PlacementHint } from './c4-canvas/c4-placement-hint.js';
import { C4Toolbar } from './c4-canvas/c4-toolbar.js';
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
  /**
   * Grid style for the shared `@workspec/canvas` Background layer, mounted
   * BENEATH the edges/cards (the enterprise app-shell's dotted grid — A1,
   * #131). Omitted = no grid, the pre-A1 render — existing consumers are
   * byte-unchanged.
   */
  backgroundVariant?: BackgroundVariant | undefined;
  /**
   * Mount the shared Minimap (bottom-right, click-to-centre + drag-the-
   * viewport). Defaults to false — chrome is opt-in so embedded/golden
   * renders stay exactly as before A1. Dot colours derive from the resolved
   * element styles (spec accent per kind), matching the on-canvas cards.
   */
  showMinimap?: boolean | undefined;
  /** Mount the shared zoom controls (bottom-left: in / % / out / fit). Defaults to false, same opt-in rationale as {@link C4DiagramProps.showMinimap}. */
  showZoomControls?: boolean | undefined;
  /**
   * Instance-exposure seam (A1 review, for A2/A3): called exactly once per
   * canvas mount with the live {@link CanvasStoreInstance}, AFTER the C4
   * shape modules and facade tool are registered — the hook an embedding
   * shell uses to install a persistence host (`instance.host = …`, e.g.
   * c4-studio's `installStudioCanvasHost`) or its own tools before the
   * user can gesture. NOTE the lifetime: this component creates ONE
   * instance per mount and disposes it on unmount, and `C4Explorer`
   * remounts the diagram on every diagram/lens/direction switch — so the
   * callback fires again with a FRESH instance after each switch;
   * reinstall there, never cache the old instance. It does NOT fire again
   * for a mere model REFRESH (same view, new data): that keeps the same
   * instance, so a host installed on the first mount stays installed and
   * whatever camera the user set survives (see `cameraFitKey`). Purely
   * additive: omitted = no behaviour change.
   */
  onCanvasReady?: ((instance: CanvasStoreInstance) => void) | undefined;
  /**
   * View identity for the CAMERA-FIT gate (A2 review, the editor defect):
   * an opaque string naming *which view* the `diagram` prop is a rendering
   * OF — diagram + lens + direction, whatever the caller's notion of
   * "navigation" is.
   *
   * The projection effect always re-projects the shapes, but it only
   * FRAMES the content (`fitCamera`) when this key differs from the one
   * the camera was last framed for — the first projection of a mount
   * always counts as a change. So a caller that re-supplies a *new*
   * `diagram` object for the SAME view (a model refresh after an edit,
   * which mints byte-identical-but-new layout objects) keeps the user's
   * zoom/pan, exactly like enterprise's `useC4Diagram` `resetCamera=false`
   * refetch path; a caller that navigates passes a new key and gets the
   * fit it always got.
   *
   * OMITTED = the pre-A2 behaviour, byte-for-byte: every new `diagram`
   * identity re-fits the camera. Purely additive — no existing consumer
   * changes.
   */
  cameraFitKey?: string | undefined;
  /**
   * Turn the canvas into an AUTHORING surface (A3, #133) — the enterprise
   * C4 architecture page rather than a viewer. Switching it on:
   *
   * - registers the shared `place` and `connector` tools on this instance
   *   (`registerC4` registers shape modules only), so the palette can arm
   *   them;
   * - mounts the floating {@link C4Toolbar} top-right and the placement
   *   hint bottom-centre, exactly where enterprise's `C4Toolbar` /
   *   `ArchitectureCanvasView` put them;
   * - mounts the shared `ContextMenu` on right-click (suppressed otherwise)
   *   with the C4 `Rename` row injected;
   * - extends the Escape key from "clear selection" to the full enterprise
   *   cascade (see `onContainerKeyDown`).
   *
   * It does NOT grant write access on its own: every gesture routes to
   * `instance.host`, so a canvas with no host installed still cannot mutate
   * anything.
   *
   * READ ONCE, AT MOUNT — tool registration happens in the instance
   * initializer. Toggling it on a mounted diagram does not add the tools.
   * The explorer remounts per view switch, so this is not a practical
   * limit.
   *
   * DEFAULTS TO FALSE, and every authoring surface is gated on it, so
   * omitting it leaves the rendered output byte-identical for goldens, the
   * site demo, and the MF smoke.
   */
  authoring?: boolean | undefined;
  /**
   * Which container lens is on screen — the only input to the authoring
   * palette that this component cannot derive from `resolved` (both lenses
   * of a `c4-container` diagram share one `ResolvedDiagram`). Ignored at
   * other levels, and ignored entirely unless {@link C4DiagramProps.authoring}
   * is set. Defaults to `'logical'`, matching `C4Explorer`'s own initial lens.
   */
  lens?: C4Lens | undefined;
}

const PAN_STEP = 40;
const ZOOM_FACTOR = 1.2;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;

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
    backgroundVariant,
    showMinimap = false,
    showZoomControls = false,
    onCanvasReady,
    cameraFitKey,
    authoring = false,
    lens = 'logical',
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
    // The kind seam (issue #117): C4 cards filter/colour under their ELEMENT
    // kind (actor/system/container/…), not the engine shape type 'c4node' —
    // this is what keys the Minimap's per-kind dot colours to the same map
    // the cards' accents resolve from. Nothing else consumes the resolver
    // here (`hiddenKinds` is never set by this facade), so pre-A1 behaviour
    // is unchanged.
    const inst = createCanvasStore({
      kindResolver: (shape) =>
        shape.type === 'c4node' ? (shape as C4NodeShape).nodeType : shape.type,
    });
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
    // Authoring tools (A3, #133). `registerC4` registers SHAPE MODULES
    // only, and the whiteboard bundle that normally registers these
    // (`registerWhiteboard`) would also drag in sticky/text/draw — none of
    // which belong on a C4 canvas. Registered here, gated, so a viewer
    // instance has no reachable place/connector tool at all.
    if (authoring) {
      inst.tools.register(createPlaceTool(inst));
      inst.tools.register(createConnectorTool(inst));
    }
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

  // The view the camera was last framed for — `null` until this mount has
  // framed anything, so the FIRST projection always fits. Only ever written
  // when {@link C4DiagramProps.cameraFitKey} is supplied; without it the
  // gate below short-circuits to "always fit" (the pre-A2 behaviour).
  const fittedKeyRef = useRef<string | null>(null);

  // Projection: a new diagram prop (fresh layout / lens / diagram switch /
  // post-edit model refresh) re-projects the POSITIONED view (the caller's
  // layout + lens choice is authoritative — the synthetic single-view
  // resolved guarantees the projection can never disagree with what the
  // caller laid out) and, WHEN THE VIEW ITSELF CHANGED, frames the content
  // with the enterprise fit (1× cap). See `cameraFitKey`: re-projecting is
  // unconditional, re-framing is not, so an edit that refetches the model
  // no longer throws away the zoom/pan the user set.
  useEffect(() => {
    const synthetic: ResolvedDiagram = {
      ...resolved,
      // Mask a c4-container type so `buildC4Shapes`'s lens filter cannot
      // fire (it only bites on 'c4-container'; the type string feeds
      // nothing else in the projection).
      //
      // The reason is NOT that the caller already partitioned the nodes —
      // it hasn't. `@workspec/c4-model`'s `resolveDiagram` partitions EDGES
      // per lens and hands both lenses the SAME `nodes` array, so the
      // node-kind partition enterprise performs has no studio equivalent
      // yet (tracked separately as the lens-partition parity gap). The real
      // reason is narrower and still sound: this component renders a
      // PositionedDiagram, so every node it draws must be a node the caller
      // laid out. Filtering here would drop nodes that already occupy
      // coordinates, leaving holes in the layout. Whatever set the caller
      // positioned is the set that renders — partitioning is the model
      // layer's job, upstream of the coordinates.
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

    // The camera-fit gate. `cameraFitKey === undefined` keeps every
    // pre-A2 consumer on the old always-fit path; with a key, a DATA
    // REFRESH of the same view (same key, already framed once) re-projects
    // above and returns here, leaving `store.camera` untouched.
    const alreadyFitted = cameraFitKey !== undefined && fittedKeyRef.current === cameraFitKey;
    if (cameraFitKey !== undefined) fittedKeyRef.current = cameraFitKey;
    if (alreadyFitted) return;

    const rect = containerRef.current?.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0 && projection.bounds) {
      instance.getState().setCamera(fitCamera(projection.bounds, rect.width, rect.height));
    } else {
      instance.getState().setCamera({ x: 0, y: 0, zoom: 1 });
    }
  }, [diagram, resolved, instance, cameraFitKey]);

  // Instance exposure (A1 review, for A2/A3 host installation): fire once
  // per mount — the instance is created in the state initializer and never
  // replaced — AFTER the projection effect above (declaration order), so
  // the callback observes a fully projected canvas. Read through a ref so
  // an inline-lambda caller neither retriggers the effect nor gets a stale
  // callback.
  const onCanvasReadyRef = useRef(onCanvasReady);
  onCanvasReadyRef.current = onCanvasReady;
  useEffect(() => {
    onCanvasReadyRef.current?.(instance);
  }, [instance]);

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
      case 'Escape': {
        // ESCAPE PRECEDENCE (A3 acceptance, #133 ledger). Once a palette
        // exists, one key has to arbitrate between cancelling a
        // half-finished operation and dismissing a passive panel. The order
        // below is enterprise's, ported from `useKeyboardShortcuts.ts:89-98`
        // — most-transient state first, so Escape always undoes the LAST
        // thing the user started:
        //
        //   0. an open inline editor (node name / edge label) — never gets
        //      here at all: both editors `stopPropagation()` on every key
        //      (`c4-node-component.tsx:82`, `connector-layer.tsx:120`), so
        //      Escape cancels the edit at the input and this handler never
        //      runs. That is also the Backspace guard below.
        //   1. an open context menu — its own `document` listener closes it
        //      (`context-menu.tsx:104-106`).
        //   2. `editingId` set with focus elsewhere — leave edit mode.
        //   3. PLACE MODE ARMED — disarm back to Select. Outranks the rail
        //      because placement is an operation IN FLIGHT and the rail is
        //      just a panel; the placement hint pill advertises exactly
        //      this ("Esc to cancel").
        //   4. otherwise — clear the selection, which is what dismisses
        //      `C4Explorer`'s detail rail (its own root handler, and the
        //      `onSelect(null)` below).
        //
        // Cases 2 and 3 CONSUME the event (`stopPropagation`) so the
        // explorer's root Escape handler cannot also close the rail behind
        // the user's back — one Escape, one effect. Case 4 lets it bubble,
        // because there the two handlers want the same thing.
        //
        // Neither case is gated on `authoring`: `activeTool === 'place'` is
        // unreachable without it (the tool is not registered), and an edit
        // session IS reachable without it — double-clicking a connector
        // opens the edge-label editor on any canvas — so gating case 2
        // would leave viewers with an Escape that clears the selection out
        // from under an open editor.
        if (store.editingId !== null) {
          store.setEditing(null);
          event.stopPropagation();
          break;
        }
        if (store.activeTool === 'place') {
          store.setActiveTool('select');
          event.stopPropagation();
          break;
        }
        store.clearSelection();
        onSelect?.(null);
        break;
      }
      case 'Delete':
      case 'Backspace': {
        // Deletion is a MODEL mutation, so it only exists when an embedding
        // shell has installed a persistence host that owns it (A1 review —
        // `instance.host.deleteShapes`, e.g. c4-studio's studio canvas
        // host via `onCanvasReady`). Host-less renders (goldens, the site
        // demo, the MF smoke) keep their pre-A1 keyboard surface exactly:
        // Delete falls through untouched, never a local-only delete.
        if (instance.host.deleteShapes === undefined) break;
        // TYPING GUARD (A3 acceptance, #133 ledger). Backspace is both
        // "delete the selection" and "delete the character behind the
        // caret", and A3 puts text inputs on this canvas for the first
        // time (the pending-node name editor, the edge-label editor). The
        // primary defence is that both editors stop propagation, so this
        // handler never sees their keys — but that is a property of ANOTHER
        // file, and the cost of it regressing is destroying the user's node
        // mid-rename. So the branch refuses independently, on both signals
        // enterprise uses (`use-keyboard-shortcuts.ts:109-116`): an active
        // edit session, and an editable event target.
        if (store.editingId !== null) break;
        const target = event.target as HTMLElement | null;
        const tag = target?.tagName;
        if (target?.isContentEditable === true || tag === 'INPUT' || tag === 'TEXTAREA') break;
        const ids = [...store.selectedIds];
        if (ids.length === 0) break;
        event.preventDefault();
        store.deleteShapes(ids);
        onSelect?.(null);
        break;
      }
      default:
        break;
    }
  }

  const canvasSpec = useMemo(() => buildCanvasSpec(spec), [spec]);
  // Minimap dot colours: element kind → the SAME resolved accent the card
  // chrome renders with (spec overrides included), so the minimap is a true
  // recolour of the canvas, not a second palette.
  const minimapKindColors = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(canvasSpec.elements).map(([kind, style]) => [kind, style.accent]),
      ),
    [canvasSpec],
  );
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
                <Canvas
                  shortcutScope="none"
                  // The shared menu, unmodified, is what enterprise's C4
                  // canvas shows — plus the C4 `Rename` row in its
                  // host-items slot. Viewers keep the suppressed menu they
                  // have always had.
                  renderContextMenu={
                    authoring
                      ? (menu) => (
                          <ContextMenu
                            {...menu}
                            extraItems={
                              <C4ContextMenuExtras ids={menu.ids} onClose={menu.onClose} />
                            }
                          />
                        )
                      : () => null
                  }
                >
                  {backgroundVariant !== undefined && <Background variant={backgroundVariant} />}
                  <ConnectorLayer />
                  <ShapeLayer />
                  {showZoomControls && <CanvasZoomControls />}
                  {showMinimap && <Minimap kindColors={minimapKindColors} />}
                  <TooltipOverlay
                    nodesById={nodesById}
                    elementsByKindAndSlug={elementsByKindAndSlug}
                    linkResolver={linkResolver}
                  />
                </Canvas>
                {/* Floating authoring chrome — a SIBLING of the canvas
                    inside the same positioned stage, exactly as enterprise
                    composes it (`ArchitectureCanvasView.tsx:493-550`: the
                    toolbar and hint are siblings of `<Canvas>`, never
                    children of it). */}
                {authoring && (
                  <>
                    <C4Toolbar
                      palette={paletteForDiagram(resolved.type, lens)}
                      // Resolved at CLICK time, not render time: the host
                      // is installed by `onCanvasReady` (an effect, so
                      // after the first render) and `instance.host` is a
                      // plain mutable field, not reactive state — reading
                      // it during render would latch "no auto-layout"
                      // forever. Enterprise's `onRelayout` is a required
                      // prop for the same reason its button is always
                      // shown (`C4Toolbar.tsx:23,248`).
                      onRelayout={() => {
                        instance.host.autoLayout?.();
                      }}
                    />
                    <C4PlacementHint />
                  </>
                )}
              </A11yBridgeContext.Provider>
            </CanvasSpecContext.Provider>
          </CanvasProvider>
        </div>
      </div>
    </ThemedRoot>
  );
}
