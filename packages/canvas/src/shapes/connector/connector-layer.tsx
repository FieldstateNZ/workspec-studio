import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FC,
  type ReactNode,
} from 'react';
import { useCanvasHover, useCanvasInstance, useCanvasStore } from '../../canvas-provider.js';
import { pageToScreen } from '../../utils/transforms.js';
import type { ConnectorShape } from '../../shape-types.js';
import type { Vec2 } from '../../types.js';
import { useCanvasSpec } from '../../canvas-spec-context.js';
import { isDiscoveryConnector, resolveConnectorGeometry } from './geometry.js';

// Ported from the enterprise ConnectorLayer.tsx (#118). Deviations, all
// logged in the S2 report: store/hover access via provider hooks;
// `kindOfShape` → the instance's injected kindResolver; edge renames go to
// `instance.host.renameEdge` (the generalized c4Bridge); the
// atlas-drawn-edge hue is dropped with the atlas family; `drafted` (an
// enterprise-only field) is read from `meta.drafted`.

const CORNER_RADIUS = 12;

// SVG dash pattern for a connection line style. Solid → no dashes.
function dashFor(style: string | undefined): string | undefined {
  if (style === 'dashed') return '6 5';
  if (style === 'dotted') return '1.5 4';
  return undefined;
}

// Orthogonal path with rounded corners (quadratic through each bend), matching
// the diagrams page's smoothstep borderRadius. `r` is in screen px.
function roundedPath(points: Vec2[], r: number): string {
  const first = points[0];
  const second = points[1];
  if (points.length < 2 || first === undefined || second === undefined) return '';
  if (points.length === 2) {
    return `M ${String(first.x)} ${String(first.y)} L ${String(second.x)} ${String(second.y)}`;
  }
  let d = `M ${String(first.x)} ${String(first.y)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const next = points[i + 1];
    if (prev === undefined || cur === undefined || next === undefined) continue;
    const len1 = Math.hypot(prev.x - cur.x, prev.y - cur.y) || 1;
    const len2 = Math.hypot(next.x - cur.x, next.y - cur.y) || 1;
    const rr = Math.min(r, len1 / 2, len2 / 2);
    const p1 = {
      x: cur.x + ((prev.x - cur.x) / len1) * rr,
      y: cur.y + ((prev.y - cur.y) / len1) * rr,
    };
    const p2 = {
      x: cur.x + ((next.x - cur.x) / len2) * rr,
      y: cur.y + ((next.y - cur.y) / len2) * rr,
    };
    d += ` L ${String(p1.x)} ${String(p1.y)} Q ${String(cur.x)} ${String(cur.y)} ${String(p2.x)} ${String(p2.y)}`;
  }
  const last = points[points.length - 1];
  if (last) d += ` L ${String(last.x)} ${String(last.y)}`;
  return d;
}

const EdgeLabelEditor: FC<{
  shape: ConnectorShape;
  screen: Vec2;
}> = ({ shape, screen }) => {
  const instance = useCanvasInstance();
  const updateShape = useCanvasStore((s) => s.updateShape);
  const setEditing = useCanvasStore((s) => s.setEditing);
  const ref = useRef<HTMLInputElement>(null);
  const [val, setVal] = useState(shape.label ?? '');

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const commit = (): void => {
    const next = val.trim();
    if (next !== (shape.label ?? '')) {
      updateShape(shape.id, { label: next });
      instance.host.renameEdge?.(shape.edgeFrom, shape.edgeTo, next);
    }
    setEditing(null);
  };

  return (
    <input
      ref={ref}
      data-canvas-ui
      value={val}
      onChange={(e) => {
        setVal(e.target.value);
      }}
      onBlur={commit}
      onPointerDown={(e) => {
        e.stopPropagation();
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          ref.current?.blur();
        } else if (e.key === 'Escape') {
          setVal(shape.label ?? '');
          ref.current?.blur();
        }
      }}
      style={{
        position: 'absolute',
        left: screen.x,
        top: screen.y,
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'auto',
        fontSize: 11,
        textAlign: 'center',
        width: 140,
        background: 'var(--bg-elevated)',
        color: 'var(--ink)',
        border: '1px solid var(--accent)',
        borderRadius: 6,
        padding: '2px 6px',
        outline: 'none',
      }}
    />
  );
};

export const ConnectorLayer: FC = () => {
  const instance = useCanvasInstance();
  const shapes = useCanvasStore((s) => s.shapes);
  const camera = useCanvasStore((s) => s.camera);
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const editingId = useCanvasStore((s) => s.editingId);
  const hiddenKinds = useCanvasStore((s) => s.hiddenKinds);
  const hoveredId = useCanvasHover((s) => s.hoveredId);
  const spec = useCanvasSpec();
  const kindOf = instance.kindResolver;

  // Mirror ShapeLayer's hiddenKinds filter (connector visuals render in this
  // SVG layer, not ShapeLayer); an edge also hides when either endpoint's
  // kind is filtered so no line dangles toward an invisible shape.
  const connectors = Object.values(shapes)
    .filter((s): s is ConnectorShape => s.type === 'connector')
    .filter((c) => {
      if (hiddenKinds.size === 0) return true;
      if (hiddenKinds.has('connector')) return false;
      const source = c.sourceShapeId ? shapes[c.sourceShapeId] : undefined;
      const target = c.targetShapeId ? shapes[c.targetShapeId] : undefined;
      if (source && hiddenKinds.has(kindOf(source))) return false;
      if (target && hiddenKinds.has(kindOf(target))) return false;
      return true;
    })
    .sort((a, b) => a.index.localeCompare(b.index));

  if (connectors.length === 0) return null;

  const arrowScale = camera.zoom;
  const strokeW = Math.max(1.2, 2.4 * camera.zoom);

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <svg
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          overflow: 'visible',
        }}
      >
        {connectors.map((c) => {
          const geom = resolveConnectorGeometry(c, shapes);
          if (!geom) return null;
          const selected = selectedIds.has(c.id);
          // Active when the edge itself OR one of its endpoint nodes is hovered
          // — so hovering a line lights its nodes, and hovering a node lights
          // its lines.
          const active =
            !!hoveredId &&
            (hoveredId === c.id || hoveredId === c.sourceShapeId || hoveredId === c.targetShapeId);
          const emphasized = selected || active;
          const screenPts = geom.points.map((p) => pageToScreen(p, camera));
          const p0 = screenPts[0];
          const p1 = screenPts[1];

          // Discovery Board connector (#363): a straight dashed link in
          // --ink-ghost, with the edge-flow dash march on hover. No
          // arrowhead/aura — Discovery edges read as soft ties, not directed
          // C4 dependencies.
          if (isDiscoveryConnector(c, shapes)) {
            if (p0 === undefined || p1 === undefined) return null;
            const dStraight = `M ${String(p0.x)} ${String(p0.y)} L ${String(p1.x)} ${String(p1.y)}`;
            const stroke = selected ? 'var(--accent)' : 'var(--ink-ghost)';
            return (
              <g key={c.id}>
                <path
                  d={dStraight}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeDasharray="5 5"
                  style={{
                    transition: 'stroke 200ms ease',
                    animation: active ? 'edge-flow 0.6s linear infinite' : undefined,
                  }}
                />
              </g>
            );
          }

          const d = roundedPath(screenPts, CORNER_RADIUS * camera.zoom);
          const arrowScreen = pageToScreen({ x: geom.arrow.x, y: geom.arrow.y }, camera);
          const conn = c.category ? spec.connections[c.category] : undefined;
          // Style-spec v2: the connection accent feeds --conn-accent-raw on the
          // <g> (class c4-conn) so CSS applies the dark lift. Selected edges use
          // the app accent; everything else draws in --conn-accent.
          const connAccentRaw = conn?.accent ?? 'var(--c4-conn-default)';
          const stroke = selected ? 'var(--accent)' : 'var(--conn-accent)';
          // Drafted edges (either endpoint artifact uncommitted on the
          // viewer's branch — hosts set meta.drafted) always dash, regardless
          // of the spec style.
          const drafted = (c.meta as { drafted?: boolean } | undefined)?.drafted === true;
          const dash = drafted ? '6 5' : dashFor(conn?.style);
          return (
            <g
              key={c.id}
              className="c4-conn"
              style={{ ['--conn-accent-raw']: connAccentRaw } as CSSProperties}
            >
              {/* Soft aura — blurred halo that fades in when emphasized. */}
              <path
                d={d}
                fill="none"
                stroke={stroke}
                strokeWidth={strokeW + 4}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  filter: 'blur(4px)',
                  opacity: emphasized ? 0.4 : 0,
                  transition: 'opacity 200ms ease',
                }}
              />
              <path
                d={d}
                fill="none"
                stroke={stroke}
                strokeWidth={emphasized ? strokeW + 1 : strokeW}
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeDasharray={dash}
                opacity={c.freeEnd ? 0.7 : 1}
                style={{
                  transition: 'stroke 200ms ease, stroke-width 200ms ease',
                  animation: active && dash ? 'edge-flow 0.6s linear infinite' : undefined,
                }}
              />
              <path
                d="M -8 -4 L 0 0 L -8 4 Z"
                fill={stroke}
                transform={`translate(${String(arrowScreen.x)} ${String(arrowScreen.y)}) rotate(${String(geom.arrow.angle)}) scale(${String(arrowScale)})`}
                style={{ transition: 'fill 200ms ease' }}
              />
            </g>
          );
        })}
      </svg>

      {connectors.map((c) => {
        const geom = resolveConnectorGeometry(c, shapes);
        if (!geom || !c.cardinality) return null;
        // ER multiplicity chips sit just inside each endpoint, nudged along
        // the first/last segment so they don't sit on the node border.
        const chipAt = (anchor: Vec2, toward: Vec2, key: string, text: string): ReactNode => {
          const dx = toward.x - anchor.x;
          const dy = toward.y - anchor.y;
          const len = Math.hypot(dx, dy) || 1;
          const t = Math.min(24, len / 3);
          const p = pageToScreen(
            { x: anchor.x + (dx / len) * t, y: anchor.y + (dy / len) * t },
            camera,
          );
          return (
            <div
              key={key}
              style={{
                position: 'absolute',
                left: p.x,
                top: p.y,
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
                fontSize: 10,
                fontVariantNumeric: 'tabular-nums',
                padding: '1px 4px',
                borderRadius: 4,
                background: 'color-mix(in oklab, var(--bg-elevated) 88%, transparent)',
                color: 'var(--ink-soft)',
                border: '1px solid var(--line)',
                whiteSpace: 'nowrap',
              }}
            >
              {text}
            </div>
          );
        };
        const first = geom.points[0];
        if (first === undefined) return null;
        const second = geom.points[1] ?? first;
        const last = geom.points[geom.points.length - 1] ?? first;
        const penultimate = geom.points[geom.points.length - 2] ?? last;
        return (
          <Fragment key={`card-${c.id}`}>
            {chipAt(first, second, `card-from-${c.id}`, c.cardinality.from)}
            {chipAt(last, penultimate, `card-to-${c.id}`, c.cardinality.to)}
          </Fragment>
        );
      })}

      {connectors.map((c) => {
        const geom = resolveConnectorGeometry(c, shapes);
        if (!geom) return null;
        const labelScreen = pageToScreen(geom.label, camera);
        if (editingId === c.id) {
          return <EdgeLabelEditor key={`edit-${c.id}`} shape={c} screen={labelScreen} />;
        }
        if (!c.label) return null;
        // Discovery Board connector label (#363): a mono midpoint chip whose
        // text colour matches the line's stroke.
        if (isDiscoveryConnector(c, shapes)) {
          const labelColor = selectedIds.has(c.id) ? 'var(--accent)' : 'var(--ink-ghost)';
          return (
            <div
              key={`label-${c.id}`}
              style={{
                position: 'absolute',
                left: labelScreen.x,
                top: labelScreen.y,
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
                fontFamily: 'var(--mono)',
                fontSize: 9,
                fontWeight: 600,
                color: labelColor,
                background: 'var(--canvas-bg)',
                border: '1px solid var(--line)',
                borderRadius: 5,
                padding: '1px 6px',
                whiteSpace: 'nowrap',
              }}
            >
              {c.label}
            </div>
          );
        }
        return (
          <div
            key={`label-${c.id}`}
            style={{
              position: 'absolute',
              left: labelScreen.x,
              top: labelScreen.y,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
              fontSize: 11,
              lineHeight: 1.2,
              maxWidth: 180,
              textAlign: 'center',
              padding: '2px 6px',
              borderRadius: 6,
              background: 'color-mix(in oklab, var(--bg-elevated) 88%, transparent)',
              color: 'var(--ink-soft)',
              border: '1px solid var(--line)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {c.label}
          </div>
        );
      })}
    </div>
  );
};
