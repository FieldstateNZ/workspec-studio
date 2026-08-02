import type { ShapeUtil } from '../../shape-util.js';
import type { ConnectorShape } from '../../shape-types.js';
import type { Box, Vec2 } from '../../types.js';
import type { CanvasStoreInstance } from '../../store/store.types.js';
import { hitTestPointToPolyline } from '../../utils/geometry.js';
import { connectorAABB, resolveConnectorGeometry } from './geometry.js';

const DEGENERATE: Box = { x: 0, y: 0, width: 0, height: 0 };

/**
 * Connector util FACTORY — the S2 fix for the enterprise
 * `ConnectorShapeUtil`'s module-singleton `useCanvasStore.getState()`
 * reads (#118): bounds/hit-test need the LIVE shape record + camera, which
 * are instance state, so the util closes over its canvas instance and each
 * instance registers its own.
 *
 * Connectors are drawn by ConnectorLayer (a screen-space SVG), not through
 * Shape.tsx — its per-shape scale(zoom)+contain transform fights SVG
 * paths. The Component therefore returns null, but the util still
 * implements bounds / hit-test so the connector is a first-class,
 * selectable, deletable shape.
 */
export function createConnectorShapeUtil(instance: CanvasStoreInstance): ShapeUtil<ConnectorShape> {
  return {
    type: 'connector',

    defaultProps: (point: Vec2) => ({
      type: 'connector' as const,
      x: point.x,
      y: point.y,
      width: 0,
      height: 0,
      sourceShapeId: null,
      targetShapeId: null,
      edgeFrom: '',
      edgeTo: '',
    }),

    // Bounds recompute from live endpoints (used by marquee selection). The
    // stored x/y/width/height are a coarse cache only.
    getBounds: (shape: ConnectorShape): Box => {
      const geom = resolveConnectorGeometry(shape, instance.getState().shapes);
      return geom ? connectorAABB(geom) : DEGENERATE;
    },

    // SelectTool passes localPoint = {pageX - shape.x, pageY - shape.y}. We
    // reconstruct the absolute page point (drift-proof against a stale
    // shape.x/y) and test against the live polyline with a zoom-constant
    // tolerance.
    hitTest: (shape: ConnectorShape, localPoint: Vec2): boolean => {
      const { shapes, camera } = instance.getState();
      const geom = resolveConnectorGeometry(shape, shapes);
      if (!geom || geom.points.length < 2) return false;
      const abs: Vec2 = { x: localPoint.x + shape.x, y: localPoint.y + shape.y };
      const tol = 8 / camera.zoom;
      return hitTestPointToPolyline(abs, geom.points, tol);
    },

    canResize: () => false,
    // meta.labelLocked marks edges whose label is derived (e.g. the workflow
    // planner's rule summary) — inline editing would be overwritten on the
    // next projection, so block it at the source.
    canEditText: (shape) => !(shape.meta as { labelLocked?: boolean } | undefined)?.labelLocked,

    // Connectors render their own selected/hover highlight in ConnectorLayer;
    // their AABB rect would be a meaningless box around the edge. Replaces
    // the enterprise SelectionLayer's hard-coded 'connector' opt-out.
    selfRendersSelection: () => true,

    Component: () => null,
  };
}
