import type { Tool } from './tool-base.js';
import type { CanvasStore, CanvasStoreInstance } from '../store/store.types.js';
import type { ConnectorShape } from '../shape-types.js';
import type { Shape, ShapeId } from '../types.js';
import { createShapeId } from '../utils/ids.js';
import { generateInitialKey } from '../utils/fractional-index.js';
import { hitTestPointInRect } from '../utils/geometry.js';

// Legacy connectable node kinds + their endpoint keys, preserved from the
// enterprise ConnectorTool so re-adopted enterprise shape sets connect
// without capability registration: a C4 node by its REST slug, a workflow
// state by its state key, a freeform custom-diagram node by its shape id.
// New shape modules opt in via the `isConnectable`/`connectorKey` ShapeUtil
// capabilities instead (#118).
const LEGACY_CONNECTABLE = new Set<string>(['c4node', 'workflownode', 'diagram-node']);

function legacyKey(shape: Shape): string {
  if (shape.type === 'c4node' && typeof shape['slug'] === 'string') return shape['slug'];
  if (shape.type === 'workflownode' && typeof shape['stateKey'] === 'string')
    return shape['stateKey'];
  return shape.id;
}

/**
 * Drag from a source node, rubber-band to a target node, release to create
 * the edge through the host bridge (`CanvasHost.createEdge`). The
 * rubber-band is a real transient connector shape written via
 * `_setShapesRaw` with `meta.ephemeral`, so it renders identically to a
 * committed edge and never enters the undo history or snapshots.
 */
export function createConnectorTool(instance: CanvasStoreInstance): Tool {
  let dragId: ShapeId | null = null;
  let srcId: ShapeId | null = null;

  const isConnectable = (s: Shape): boolean => {
    const util = instance.shapeUtils.get(s.type);
    if (util?.isConnectable) return util.isConnectable(s);
    return LEGACY_CONNECTABLE.has(s.type);
  };

  const endpointKey = (s: Shape): string => {
    const util = instance.shapeUtils.get(s.type);
    if (util?.connectorKey) return util.connectorKey(s);
    return legacyKey(s);
  };

  // Hit-test connectable nodes only (front-to-back), ignoring connectors and
  // other shapes.
  const hitTestNode = (pageX: number, pageY: number, store: CanvasStore): ShapeId | null => {
    const sorted = Object.values(store.shapes).sort((a, b) => b.index.localeCompare(a.index));
    for (const s of sorted) {
      if (!isConnectable(s)) continue;
      if (
        hitTestPointInRect(
          { x: pageX - s.x, y: pageY - s.y },
          { x: 0, y: 0, width: s.width, height: s.height },
        )
      ) {
        return s.id;
      }
    }
    return null;
  };

  const cleanupTransient = (store: CanvasStore): void => {
    if (!dragId) return;
    const next: Record<ShapeId, Shape> = {};
    for (const [key, value] of Object.entries(store.shapes)) {
      if (key !== dragId) next[key as ShapeId] = value;
    }
    store._setShapesRaw(next);
    dragId = null;
  };

  return {
    name: 'connector',
    cursor: 'crosshair',

    onPointerDown: (e, store) => {
      const hit = hitTestNode(e.pageX, e.pageY, store);
      if (!hit) return;
      const src = store.shapes[hit];
      if (!src || !isConnectable(src)) return;
      srcId = hit;
      const id = createShapeId();
      const transient: ConnectorShape = {
        id,
        type: 'connector',
        index: generateInitialKey(),
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        sourceShapeId: hit,
        targetShapeId: null,
        freeEnd: { x: e.pageX, y: e.pageY },
        edgeFrom: endpointKey(src),
        edgeTo: '',
        meta: { ephemeral: true },
      };
      dragId = id;
      store._setShapesRaw({ ...store.shapes, [id]: transient });
    },

    onPointerMove: (e, store) => {
      if (!dragId) return;
      const c = store.shapes[dragId] as ConnectorShape | undefined;
      if (!c) return;
      const hovered = hitTestNode(e.pageX, e.pageY, store);
      const target = hovered && hovered !== srcId ? hovered : null;
      store._setShapesRaw({
        ...store.shapes,
        [dragId]: { ...c, freeEnd: { x: e.pageX, y: e.pageY }, targetShapeId: target },
      });
    },

    onPointerUp: (e, store) => {
      const from = srcId;
      srcId = null;
      const target = dragId ? hitTestNode(e.pageX, e.pageY, store) : null;
      cleanupTransient(store);
      if (!from || !target || target === from) return;
      const src = store.shapes[from];
      const tgt = store.shapes[target];
      if (!src || !tgt || !isConnectable(src) || !isConnectable(tgt)) return;
      instance.host.createEdge?.(endpointKey(src), endpointKey(tgt));
    },
  };
}
