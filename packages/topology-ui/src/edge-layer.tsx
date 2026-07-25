// The SVG overlay drawing every declared connection: primary edges solid
// with an arrowhead, telemetry edges faint-dashed with a fainter arrowhead —
// ported from the design's `<defs>`/`arr`/`arrFaint` markers and its
// per-connection `<path>` styling. Routing is `orthoPath` (the design's
// `ortho()` port) with per-endpoint fan-out (`fanEdges`) standing in for the
// design's hand-authored per-edge channel offsets — see those modules' own
// comments for why an exact pixel match to the mockup isn't possible from
// `ResolvedConnection` alone.

import type { CSSProperties, ReactElement } from 'react';
import { useId, useMemo } from 'react';
import type { ResolvedConnection } from '@workspec/topology-model';
import { fanEdges } from './geometry/fan-edges.js';
import { orthoPath } from './geometry/ortho-path.js';
import type { Rect } from './geometry/rect.js';

/** One Drift-view "mis-wired" bypass edge — the actual-only connection a `MiswiredDrift` reports, rendered as a dashed danger-coloured reroute line over the declared graph. Both endpoints must be authored (canonical) slugs already present in `rects` — see `drift-canvas-data.ts`'s `buildGhostEdges`. */
export interface GhostEdge {
  readonly from: string;
  readonly to: string;
}

/** Props for {@link EdgeLayer}. */
export interface EdgeLayerProps {
  connections: readonly ResolvedConnection[];
  rects: ReadonlyMap<string, Rect>;
  width: number;
  height: number;
  /** P5 extension point (Drift view) — see `GhostEdge`. Omit for no ghost edges. */
  ghostEdges?: readonly GhostEdge[];
}

export function EdgeLayer(props: EdgeLayerProps): ReactElement {
  const { connections, rects, width, height, ghostEdges } = props;
  const idPrefix = useId();
  const arrowId = `${idPrefix}-arrow`;
  const arrowFaintId = `${idPrefix}-arrow-faint`;
  const arrowDangerId = `${idPrefix}-arrow-danger`;

  const offsets = useMemo(() => fanEdges(connections), [connections]);

  const style: CSSProperties = { position: 'absolute', inset: 0, pointerEvents: 'none' };

  return (
    <svg className="tp-edges" width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={style}>
      <defs>
        <marker
          id={arrowId}
          markerWidth={9}
          markerHeight={9}
          refX={7}
          refY={3}
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M0 0 L7 3 L0 6 z" fill="var(--ink-fade)" />
        </marker>
        <marker
          id={arrowFaintId}
          markerWidth={8}
          markerHeight={8}
          refX={6}
          refY={2.5}
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M0 0 L6 2.5 L0 5 z" fill="var(--line-2)" />
        </marker>
        <marker
          id={arrowDangerId}
          markerWidth={9}
          markerHeight={9}
          refX={7}
          refY={3}
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M0 0 L7 3 L0 6 z" fill="var(--danger)" />
        </marker>
      </defs>
      {connections.map((connection, index) => {
        const source = rects.get(connection.from);
        const target = rects.get(connection.to);
        // Defensive, not expected: `resolve()` prunes any connection whose
        // endpoint didn't survive, so every remaining connection's
        // endpoints are guaranteed to be in `rects` — but a canvas must
        // never crash on a model invariant it didn't itself check.
        if (!source || !target) return null;

        const offset = offsets[index] ?? { sOff: 0, tOff: 0 };
        const d = orthoPath(source, target, offset);
        const telemetry = connection.class === 'telemetry';

        return (
          <path
            key={`${connection.from}>${connection.to}>${connection.class}`}
            d={d}
            fill="none"
            stroke={telemetry ? 'var(--line-2)' : 'var(--ink-fade)'}
            strokeWidth={telemetry ? 1.3 : 1.7}
            strokeDasharray={telemetry ? '2 5' : undefined}
            opacity={telemetry ? 0.7 : 0.9}
            markerEnd={`url(#${telemetry ? arrowFaintId : arrowId})`}
          />
        );
      })}
      {(ghostEdges ?? []).map((ghost) => {
        const source = rects.get(ghost.from);
        const target = rects.get(ghost.to);
        // Defensive: `buildGhostEdges` only ever names authored-canonical
        // slugs from a matched `MiswiredDrift`, so both should always be in
        // `rects` — but a canvas must never crash on a data shape it didn't
        // itself validate.
        if (!source || !target) return null;

        return (
          <path
            key={`ghost:${ghost.from}>${ghost.to}`}
            d={orthoPath(source, target)}
            fill="none"
            stroke="var(--danger)"
            strokeWidth={2.2}
            strokeDasharray="2 5"
            opacity={0.95}
            markerEnd={`url(#${arrowDangerId})`}
          />
        );
      })}
    </svg>
  );
}
