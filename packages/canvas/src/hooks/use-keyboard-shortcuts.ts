import { useEffect } from 'react';
import { useCanvasInstance } from '../canvas-provider.js';
import { useCamera } from './use-camera.js';
import type { ShapeId, ToolName } from '../types.js';

// Single-key tool activations (ignored while typing). The keys mirror the
// enterprise map; a key only fires when its tool is actually registered on
// the instance, so a canvas without (say) the draw tool ignores 'd' —
// enterprise had the full static set, the package registers tools per
// instance (S1 ships select; S2 the rest).
const TOOL_KEYS: Record<string, ToolName> = {
  v: 'select',
  h: 'hand',
  s: 'sticky',
  t: 'text',
  d: 'draw',
  // 'flow' ships with the enterprise prototype family, not this package —
  // the key stays mapped so a host that registers a flow tool gets the
  // enterprise binding back for free.
  l: 'flow',
};

/**
 * Window-level keyboard shortcuts for the canvas: tool keys, undo/redo
 * (mod+Z / mod+shift+Z / mod+Y), select-all, zoom reset/fit (mod+0 /
 * mod+1), delete and Escape. Mount once inside `<Canvas>` — the
 * listeners are window-scoped (as in the enterprise source), so a page
 * mounting two canvases should mount only one and drive the other
 * imperatively (see the README note).
 */
export function useKeyboardShortcuts(): void {
  const instance = useCanvasInstance();
  const { resetZoom, zoomToFit } = useCamera();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement;
      const inEditable =
        target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      const store = instance.getState();

      if (!inEditable) {
        const toolName = TOOL_KEYS[e.key.toLowerCase()];
        if (toolName && instance.tools.get(toolName)) {
          store.setActiveTool(toolName);
          return;
        }
      }

      const isMod = e.metaKey || e.ctrlKey;

      if (isMod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        store.undo();
        return;
      }

      if ((isMod && e.key === 'z' && e.shiftKey) || (isMod && e.key === 'y')) {
        e.preventDefault();
        store.redo();
        return;
      }

      if (isMod && e.key === 'a' && !inEditable) {
        e.preventDefault();
        const allIds = Object.keys(store.shapes) as ShapeId[];
        store.select(allIds, 'replace');
        return;
      }

      if (isMod && e.key === '0') {
        e.preventDefault();
        resetZoom();
        return;
      }

      if (isMod && e.key === '1') {
        e.preventDefault();
        zoomToFit();
        return;
      }

      if (!inEditable && (e.key === 'Delete' || e.key === 'Backspace')) {
        if (store.editingId) return;
        const ids = [...store.selectedIds];
        if (ids.length > 0) {
          store.deleteShapes(ids);
        }
        return;
      }

      if (e.key === 'Escape') {
        if (store.editingId) {
          store.setEditing(null);
        } else if (store.activeTool === 'place') {
          store.setActiveTool('select');
        } else {
          store.clearSelection();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [instance, resetZoom, zoomToFit]);
}
