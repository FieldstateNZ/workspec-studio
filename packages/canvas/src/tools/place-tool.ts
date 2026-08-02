import type { Tool } from './tool-base.js';
import type { CanvasStoreInstance } from '../store/store.types.js';

/**
 * Click-to-place tool for host-model nodes. The kind to drop lives in the
 * store (`placementNodeType`, set when the user picks a palette type). Each
 * click asks the host to drop a fresh pending node of that kind at the
 * cursor (`CanvasHost.placeNode` — the node model is host-owned, so there
 * is no local fallback); the tool stays active so several nodes can be
 * placed in a row. Esc — or picking Select — exits the mode.
 */
export function createPlaceTool(instance: CanvasStoreInstance): Tool {
  return {
    name: 'place',
    cursor: 'crosshair',

    onPointerDown: (e, store) => {
      const nodeType = store.placementNodeType;
      if (nodeType === null) return;
      instance.host.placeNode?.(nodeType, { x: e.pageX, y: e.pageY });
    },
  };
}
