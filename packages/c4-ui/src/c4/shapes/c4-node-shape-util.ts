import type { Box, ShapeUtil, Vec2 } from '@workspec/canvas';
import { hitTestPointInRect } from '@workspec/canvas';
import { C4_NODE_HEIGHT, C4_NODE_WIDTH } from '@workspec/c4-layout';
import type { C4NodeMeta, C4NodeShape } from '../c4-types.js';
import { C4NodeComponent } from './c4-node-component.js';

// All C4 node types share the standard 300×110 card geometry. The
// constants are IMPORTED from @workspec/c4-layout (the position authority)
// rather than redeclared, so elk placement and the rendered cards cannot
// drift apart (#119 review FIX 4); re-exported for renderer callers.
export { C4_NODE_HEIGHT, C4_NODE_WIDTH };

export const c4NodeShapeUtil: ShapeUtil<C4NodeShape> = {
  type: 'c4node',

  defaultProps: (point: Vec2) => ({
    type: 'c4node' as const,
    x: point.x - C4_NODE_WIDTH / 2,
    y: point.y - C4_NODE_HEIGHT / 2,
    width: C4_NODE_WIDTH,
    height: C4_NODE_HEIGHT,
    slug: '',
    nodeType: 'system',
    label: 'Untitled',
  }),

  getBounds: (shape: C4NodeShape): Box => ({
    x: shape.x,
    y: shape.y,
    width: shape.width,
    height: shape.height,
  }),

  hitTest: (shape: C4NodeShape, localPoint: Vec2): boolean =>
    hitTestPointInRect(localPoint, { x: 0, y: 0, width: shape.width, height: shape.height }),

  canResize: () => false,
  // Only a pending (never-named) node is inline-editable — that's the
  // initial name-entry. Once named, double-click opens the element editor
  // instead (see C4NodeComponent).
  canEditText: (shape: C4NodeShape) => (shape.meta as C4NodeMeta | undefined)?.pending === true,

  // ── S2/S3 capability wiring (#118/#119) ──────────────────────────────────
  // The card renders its own accent selection halo — the SelectionLayer's
  // AABB rect would double up (enterprise skipped 'c4node' by name).
  selfRendersSelection: () => true,
  // Connector-tool endpoints, addressed by the node's REST slug.
  isConnectable: () => true,
  connectorKey: (shape: C4NodeShape) => shape.slug,
  // Orthogonal-router membership (capability-driven since S3): C4 nodes
  // route orthogonally AND are detour obstacles for other edges.
  routedEdges: () => true,
  isRouteObstacle: () => true,

  Component: C4NodeComponent,
};
