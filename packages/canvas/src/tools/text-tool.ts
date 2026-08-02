import type { Tool } from './tool-base.js';
import type { CanvasStore, CanvasStoreInstance } from '../store/store.types.js';
import type { Shape } from '../types.js';
import type { ShapeUtil } from '../shape-util.js';
import { createShapeId } from '../utils/ids.js';
import { generateInitialKey, generateKeyAfter } from '../utils/fractional-index.js';
import { textShapeUtil } from '../shapes/text/text-shape-util.js';

function getMaxIndex(store: CanvasStore): string | null {
  const keys = Object.values(store.shapes).map((s) => s.index);
  if (keys.length === 0) return null;
  return keys.sort().at(-1) ?? null;
}

/**
 * Click-to-place text: creates a text shape at the cursor, auto-switches
 * to select and enters editing. Instance-scoped so the shape defaults come
 * from the instance's registered 'text' util (falling back to the bundled
 * one — the enterprise static-import behaviour).
 */
export function createTextTool(instance: CanvasStoreInstance): Tool {
  return {
    name: 'text',
    cursor: 'text',

    onPointerDown: (e, store) => {
      const util: ShapeUtil = (instance.shapeUtils.get('text') ?? textShapeUtil) as ShapeUtil;
      const id = createShapeId();
      const maxKey = getMaxIndex(store);
      const index = maxKey !== null ? generateKeyAfter(maxKey) : generateInitialKey();
      const props = util.defaultProps({ x: e.pageX, y: e.pageY });
      // Omit<> over the open Shape record erases the concrete keys to an
      // index signature; the cast restores what defaultProps guarantees.
      store.createShape({ ...props, id, index } as Shape);
      store.select([id], 'replace');
      store.setActiveTool('select');
      store.setEditing(id);
    },
  };
}
