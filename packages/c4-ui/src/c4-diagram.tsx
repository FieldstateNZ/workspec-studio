// The interactive C4 canvas: renders one positioned diagram view (elements
// styled per kind, orthogonal category-coloured edges), and supports hover
// tooltips, click/Enter drill-down, wheel/drag pan-zoom, and (when the host
// grants `editLayout` and supplies a `source`) basic drag-to-pin. See the
// package README for the full interaction contract.

import type { CSSProperties, KeyboardEvent, PointerEvent, ReactElement, WheelEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { LoadedElement, ResolvedDiagram } from '@workspec/c4-model';
import type {
  LayoutDirection,
  PositionedDiagram,
  PositionedEdge,
  PositionedNode,
} from '@workspec/c4-layout';
import { layoutPathFor, serializeLayout } from '@workspec/c4-schema';
import type { Spec } from '@workspec/c4-schema';
import { serializeForWrite } from './drag/serialize-for-write.js';
import { IDENTITY_CAMERA, panBy, zoomAt } from './geometry/camera.js';
import type { Camera } from './geometry/camera.js';
import { clampTooltipPercents } from './geometry/clamp-tooltip.js';
import { contentBounds } from './geometry/content-bounds.js';
import { orthogonalEdgePath, routeMidpoint } from './geometry/edge-path.js';
import { recomputeElbowRoute } from './geometry/elbow-route.js';
import type { Rect } from './geometry/node-shape.js';
import { BOX_CORNER_RADIUS, nodeShapeGeometry } from './geometry/node-shape.js';
import { truncateLabel } from './geometry/truncate-label.js';
import { createInertLinkResolver } from './host.js';
import type { C4StudioHost } from './host.js';
import { iconFor } from './style/icons.js';
import { markerIdFor, uniqueAccents } from './style/marker-id.js';
import { resolveConnectionStyle, resolveElementStyle } from './style/spec-defaults.js';
import { ThemedRoot } from './themed-root.js';
import { tooltipContentFor, TooltipContent } from './tooltip.js';
import type { ThemeName } from './themes.js';

export interface C4DiagramProps {
  /** The positioned view to render — one `layoutDiagram` result (one lens, or the sole view). */
  diagram: PositionedDiagram;
  /** The resolved diagram this view belongs to — supplies slug/layout context for the drag-to-pin write path. */
  resolved: ResolvedDiagram;
  /** The loaded style spec, if any — accent/shape/variant overrides. Omit to render with the Enterprise defaults. */
  spec?: Spec | undefined;
  /** The embedding host: layout write-back source, link resolution, capabilities. Omit for a fully read-only, host-less render. */
  host?: C4StudioHost | undefined;
  /** Called when the user drills down on a node with a resolved slug (click, or Enter while focused). The caller decides whether that slug maps to another diagram. */
  onNavigate?: ((diagramSlug: string) => void) | undefined;
  /** Elements keyed by `elementKey(kind, slug)`, for the hover tooltip's Links section. Omit to render tooltips without a Links row. */
  elementsByKindAndSlug?: ReadonlyMap<string, LoadedElement> | undefined;
  /** Layout flow direction — must match whatever direction produced `diagram`, so a dragged node's recomputed edge routes agree with the rest. Defaults to `'LR'`. */
  direction?: LayoutDirection | undefined;
  theme?: ThemeName | undefined;
  className?: string | undefined;
}

const PAN_STEP = 40;
const ZOOM_FACTOR = 1.2;
const DRAG_THRESHOLD = 4;

function rectOf(node: PositionedNode): Rect {
  return { x: node.x, y: node.y, width: node.width, height: node.height };
}

export function C4Diagram(props: C4DiagramProps): ReactElement {
  const {
    diagram,
    resolved,
    spec,
    host,
    onNavigate,
    elementsByKindAndSlug,
    direction = 'LR',
    theme,
    className,
  } = props;

  const [nodes, setNodes] = useState<readonly PositionedNode[]>(diagram.nodes);
  const [edges, setEdges] = useState<readonly PositionedEdge[]>(diagram.edges);
  const [camera, setCamera] = useState<Camera>(IDENTITY_CAMERA);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);

  // A new diagram prop (a fresh layout, or a lens/diagram switch) resets the
  // live drag copy and the camera — never carry stale positions or a stale
  // pan/zoom across an unrelated diagram.
  useEffect(() => {
    setNodes(diagram.nodes);
    setEdges(diagram.edges);
    setCamera(IDENTITY_CAMERA);
  }, [diagram]);

  const bounds = useMemo(() => contentBounds(diagram.nodes.map(rectOf)), [diagram]);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const editable = Boolean(host?.capabilities.editLayout && host.source);

  const dragRef = useRef<{
    nodeId: string;
    startClientX: number;
    startClientY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const panRef = useRef<{ startClientX: number; startClientY: number; camera: Camera } | null>(
    null,
  );

  function pixelsToViewboxScale(): { sx: number; sy: number } {
    const rect = svgRef.current?.getBoundingClientRect();
    return {
      sx: bounds.width / (rect?.width || bounds.width),
      sy: bounds.height / (rect?.height || bounds.height),
    };
  }

  /** The outer `viewBox`-space point under a client coordinate — the outer `viewBox` is fixed regardless of pan/zoom, so this needs no camera correction. */
  function clientToViewboxPoint(clientX: number, clientY: number): { x: number; y: number } {
    const rect = svgRef.current?.getBoundingClientRect();
    const { sx, sy } = pixelsToViewboxScale();
    return {
      x: bounds.minX + (clientX - (rect?.left ?? 0)) * sx,
      y: bounds.minY + (clientY - (rect?.top ?? 0)) * sy,
    };
  }

  function activate(node: PositionedNode): void {
    if (node.slug !== null) onNavigate?.(node.slug);
  }

  function handleNodeKeyDown(event: KeyboardEvent<SVGGElement>, node: PositionedNode): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      activate(node);
    }
  }

  function writeLayout(
    nextNodes: readonly PositionedNode[],
    nextEdges: readonly PositionedEdge[],
  ): void {
    if (!host?.source) return;
    const positioned: PositionedDiagram = { nodes: nextNodes, edges: nextEdges };
    const merged = serializeForWrite(resolved.layout?.data ?? null, positioned);
    const path = layoutPathFor(resolved.slug);
    host.source
      .writeFile(path, serializeLayout(merged))
      .catch((error: unknown) =>
        setWriteError(error instanceof Error ? error.message : String(error)),
      );
  }

  function onNodePointerDown(event: PointerEvent<SVGGElement>, node: PositionedNode): void {
    if (!editable) return;
    event.stopPropagation();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture isn't universally implemented (e.g. jsdom) — the
      // drag still works via same-target events, just without capture
      // outside the element's own bounds.
    }
    dragRef.current = {
      nodeId: node.nodeId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: node.x,
      originY: node.y,
      moved: false,
    };
  }

  function onNodePointerMove(event: PointerEvent<SVGGElement>): void {
    const drag = dragRef.current;
    if (!drag) return;
    event.stopPropagation();
    const { sx, sy } = pixelsToViewboxScale();
    const dx = ((event.clientX - drag.startClientX) * sx) / camera.zoom;
    const dy = ((event.clientY - drag.startClientY) * sy) / camera.zoom;
    if (Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) drag.moved = true;

    const nextX = drag.originX + dx;
    const nextY = drag.originY + dy;

    // Rects for the edge-route recompute below: every node's CURRENT rect,
    // with the dragged node's overridden to where it's moving to right now
    // (not yet committed via `setNodes`, so edges stay in lockstep with the
    // node instead of trailing it by one event).
    const movedRects = new Map<string, Rect>(
      nodes.map((n) => [
        n.nodeId,
        n.nodeId === drag.nodeId
          ? { x: nextX, y: nextY, width: n.width, height: n.height }
          : rectOf(n),
      ]),
    );

    setNodes((prev) =>
      prev.map((n) => (n.nodeId === drag.nodeId ? { ...n, x: nextX, y: nextY } : n)),
    );
    setEdges((prevEdges) =>
      prevEdges.map((edge) => {
        if (edge.from !== drag.nodeId && edge.to !== drag.nodeId) return edge;
        const from = movedRects.get(edge.from);
        const to = movedRects.get(edge.to);
        if (!from || !to) return edge;
        return { ...edge, route: recomputeElbowRoute(from, to, direction) };
      }),
    );
  }

  function onNodePointerUp(event: PointerEvent<SVGGElement>, node: PositionedNode): void {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    event.stopPropagation();
    if (!drag.moved) {
      activate(node);
      return;
    }
    writeLayout(nodes, edges);
  }

  function onBackgroundPointerDown(event: PointerEvent<SVGSVGElement>): void {
    if (dragRef.current) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // See onNodePointerDown.
    }
    panRef.current = { startClientX: event.clientX, startClientY: event.clientY, camera };
  }

  function onBackgroundPointerMove(event: PointerEvent<SVGSVGElement>): void {
    const pan = panRef.current;
    if (!pan) return;
    const { sx, sy } = pixelsToViewboxScale();
    const dx = (event.clientX - pan.startClientX) * sx;
    const dy = (event.clientY - pan.startClientY) * sy;
    setCamera(panBy(pan.camera, dx, dy));
  }

  function onBackgroundPointerUp(): void {
    panRef.current = null;
  }

  function onWheel(event: WheelEvent<SVGSVGElement>): void {
    event.preventDefault();
    const cursor = clientToViewboxPoint(event.clientX, event.clientY);
    const factor = event.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
    setCamera((prev) => zoomAt(prev, cursor, factor));
  }

  function onContainerKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault();
        setCamera((prev) => panBy(prev, 0, PAN_STEP));
        break;
      case 'ArrowDown':
        event.preventDefault();
        setCamera((prev) => panBy(prev, 0, -PAN_STEP));
        break;
      case 'ArrowLeft':
        event.preventDefault();
        setCamera((prev) => panBy(prev, PAN_STEP, 0));
        break;
      case 'ArrowRight':
        event.preventDefault();
        setCamera((prev) => panBy(prev, -PAN_STEP, 0));
        break;
      case '+':
      case '=':
        event.preventDefault();
        setCamera((prev) =>
          zoomAt(
            prev,
            { x: bounds.minX + bounds.width / 2, y: bounds.minY + bounds.height / 2 },
            ZOOM_FACTOR,
          ),
        );
        break;
      case '-':
      case '_':
        event.preventDefault();
        setCamera((prev) =>
          zoomAt(
            prev,
            { x: bounds.minX + bounds.width / 2, y: bounds.minY + bounds.height / 2 },
            1 / ZOOM_FACTOR,
          ),
        );
        break;
      default:
        break;
    }
  }

  const connectionAccents = useMemo(
    () => uniqueAccents(edges.map((edge) => resolveConnectionStyle(edge.category, spec).accent)),
    [edges, spec],
  );

  const hoveredNode = nodes.find((n) => n.nodeId === hoveredId) ?? null;
  const linkResolver = useMemo(
    () => host?.linkResolver ?? createInertLinkResolver(),
    [host?.linkResolver],
  );

  return (
    <ThemedRoot theme={theme} className={className}>
      <div
        ref={containerRef}
        className="c4-diagram"
        tabIndex={0}
        onKeyDown={onContainerKeyDown}
        aria-label={`${resolved.title} diagram`}
      >
        {writeError !== null && (
          <div className="c4-write-error" role="alert">
            {`Could not save layout: ${writeError}`}
          </div>
        )}
        <svg
          ref={svgRef}
          className="c4-canvas"
          viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
          preserveAspectRatio="none"
          role="group"
          aria-label={resolved.title}
          onPointerDown={onBackgroundPointerDown}
          onPointerMove={onBackgroundPointerMove}
          onPointerUp={onBackgroundPointerUp}
          onWheel={onWheel}
        >
          <defs>
            {connectionAccents.map((accent) => (
              <marker
                key={accent}
                id={markerIdFor(accent)}
                markerWidth={8}
                markerHeight={8}
                refX={7}
                refY={4}
                orient="auto"
              >
                <path d="M0,0 L8,4 L0,8 Z" style={{ fill: accent }} />
              </marker>
            ))}
          </defs>
          <rect
            x={bounds.minX}
            y={bounds.minY}
            width={bounds.width}
            height={bounds.height}
            className="c4-canvas-bg"
            style={{ fill: 'var(--canvas-bg)' }}
          />
          <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`}>
            <g className="c4-edges">
              {edges.map((edge) => {
                const connStyle = resolveConnectionStyle(edge.category, spec);
                const d = orthogonalEdgePath(edge.route);
                const mid = routeMidpoint(edge.route);
                return (
                  <g
                    key={`${edge.from}->${edge.to}:${edge.label ?? ''}`}
                    role="img"
                    aria-label={`${edge.from} to ${edge.to}${edge.label ? `: ${edge.label}` : ''}`}
                  >
                    <path
                      d={d}
                      className="c4-edge-path"
                      markerEnd={`url(#${markerIdFor(connStyle.accent)})`}
                      style={{
                        fill: 'none',
                        stroke: connStyle.accent,
                        strokeWidth: 1.5,
                        strokeDasharray: connStyle.style === 'dashed' ? '6 4' : undefined,
                      }}
                    />
                    {edge.label !== null && (
                      <text x={mid.x} y={mid.y - 4} textAnchor="middle" className="c4-edge-label">
                        {truncateLabel(edge.label, 28)}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
            <g className="c4-nodes">
              {nodes.map((node) => {
                const style = resolveElementStyle(node.kind, spec);
                const shape = nodeShapeGeometry(rectOf(node), style.shape);
                const Icon = iconFor(style.icon);
                const isHovered = hoveredId === node.nodeId;
                const isFocused = focusedId === node.nodeId;
                const drillable = node.slug !== null;
                const nodeClasses = ['c4-node'];
                if (isHovered) nodeClasses.push('c4-node-hover');
                if (isFocused) nodeClasses.push('c4-node-focus');
                const ringRadius = (shape.kind === 'rect' ? shape.rx : BOX_CORNER_RADIUS) + 3;
                return (
                  <g
                    key={node.nodeId}
                    className={nodeClasses.join(' ')}
                    role="button"
                    tabIndex={0}
                    aria-label={`${node.kind ?? 'element'}: ${node.title}`}
                    aria-disabled={!drillable}
                    // The Enterprise `.c4-el` pattern: the resolved accent rides in
                    // as a custom property; surface/border/eyebrow derive from it in
                    // styles.css's `.c4-node` color-mix layer.
                    style={{ '--c4-el-accent-raw': style.accent } as CSSProperties}
                    onPointerEnter={() => setHoveredId(node.nodeId)}
                    onPointerLeave={() => setHoveredId((id) => (id === node.nodeId ? null : id))}
                    onFocus={() => {
                      setHoveredId(node.nodeId);
                      setFocusedId(node.nodeId);
                    }}
                    onBlur={() => {
                      setHoveredId((id) => (id === node.nodeId ? null : id));
                      setFocusedId((id) => (id === node.nodeId ? null : id));
                    }}
                    onKeyDown={(e) => handleNodeKeyDown(e, node)}
                    onPointerDown={(e) => onNodePointerDown(e, node)}
                    onPointerMove={onNodePointerMove}
                    onPointerUp={(e) => onNodePointerUp(e, node)}
                    // When `editable`, `onNodePointerUp` already decides drag-vs-click
                    // (a real drag never calls `activate`); the native `click` event
                    // that follows every `pointerup` would otherwise double-fire it,
                    // so this only activates directly for the non-editable (no
                    // pointer-drag handling at all) case.
                    onClick={() => {
                      if (!editable) activate(node);
                    }}
                  >
                    {shape.kind === 'rect' ? (
                      <rect
                        x={node.x}
                        y={node.y}
                        width={node.width}
                        height={node.height}
                        rx={shape.rx}
                        ry={shape.ry}
                        style={{
                          fill: 'var(--c4-el-surface)',
                          stroke: 'var(--c4-el-border)',
                          strokeWidth: 1,
                        }}
                      />
                    ) : (
                      <>
                        <path
                          d={shape.outline}
                          style={{
                            fill: 'var(--c4-el-surface)',
                            stroke: 'var(--c4-el-border)',
                            strokeWidth: 1,
                          }}
                        />
                        {shape.decoration !== undefined && (
                          <path
                            d={shape.decoration}
                            style={{ fill: 'none', stroke: 'var(--c4-el-border)', strokeWidth: 1 }}
                          />
                        )}
                      </>
                    )}
                    {/* The 4px accent identity stripe — a line (not a filled rect) so the
                        external variant can dash it, mirroring Enterprise's dashed
                        borderLeft on `variant: external` nodes. */}
                    <line
                      x1={node.x + 2}
                      y1={node.y}
                      x2={node.x + 2}
                      y2={node.y + node.height}
                      style={{
                        stroke: 'var(--c4-el-accent)',
                        strokeWidth: 4,
                        strokeDasharray: style.variant === 'external' ? '6 3' : undefined,
                      }}
                    />
                    <Icon
                      x={node.x + 14}
                      y={node.y + 12}
                      width={18}
                      height={18}
                      style={{ color: 'var(--c4-el-accent)' }}
                    />
                    <text x={node.x + 40} y={node.y + 26} className="c4-node-title">
                      {truncateLabel(node.title, 26)}
                    </text>
                    {node.description !== null && node.description !== '' && (
                      <text x={node.x + 14} y={node.y + 50} className="c4-node-desc">
                        {truncateLabel(node.description, 34)}
                      </text>
                    )}
                    {node.technology !== null && node.technology !== '' && (
                      <text x={node.x + 14} y={node.y + node.height - 12} className="c4-node-tech">
                        {truncateLabel(node.technology, 30)}
                      </text>
                    )}
                    <text
                      x={node.x + node.width - 10}
                      y={node.y + node.height - 12}
                      textAnchor="end"
                      className="c4-node-kind"
                    >
                      {node.kind ?? ''}
                    </text>
                    {(isHovered || isFocused) && (
                      <rect
                        className="c4-node-ring"
                        x={node.x - 3}
                        y={node.y - 3}
                        width={node.width + 6}
                        height={node.height + 6}
                        rx={ringRadius}
                        ry={ringRadius}
                      />
                    )}
                  </g>
                );
              })}
            </g>
          </g>
        </svg>
        {hoveredNode !== null &&
          (() => {
            // The node's rendered viewBox-space position after the camera
            // transform (`translate(camera.x,camera.y) scale(camera.zoom)`
            // applied to content-space coordinates), expressed as a
            // percentage of the fixed viewBox — valid because the `<svg>`
            // stretches to fill this container exactly
            // (`preserveAspectRatio="none"`, and `pixelsToViewboxScale`
            // assumes the same 1:1 stretch) — then clamped so a right/
            // bottom-edge node's tooltip never overflows the canvas.
            const clamped = clampTooltipPercents(
              ((camera.x + hoveredNode.x * camera.zoom - bounds.minX) / bounds.width) * 100,
              ((camera.y + hoveredNode.y * camera.zoom - bounds.minY) / bounds.height) * 100,
            );
            return (
              <div
                className="c4-tooltip"
                style={{ position: 'absolute', left: `${clamped.left}%`, top: `${clamped.top}%` }}
              >
                <TooltipContent
                  content={tooltipContentFor(hoveredNode, elementsByKindAndSlug)}
                  linkResolver={linkResolver}
                />
              </div>
            );
          })()}
      </div>
    </ThemedRoot>
  );
}
