import { useEffect, type RefObject } from 'react';
import { useCanvasInstance } from '../canvas-provider.js';
import { useCamera } from './use-camera.js';
import type { ShapeId, ToolName } from '../types.js';

// Single-key tool activations (ignored while typing). The keys mirror the
// enterprise map; a key only fires when its tool is actually registered on
// the instance, so a canvas without (say) the draw tool ignores 'd' —
// enterprise had the full static set, the package registers tools per
// instance (S2 ships the whiteboard set via registerWhiteboard).
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
 * Where canvas keyboard shortcuts bind (#118 scoping decision):
 *
 * - `'window'` (default) — enterprise parity: shortcuts work without
 *   focusing the canvas first. The right call for the dominant
 *   one-canvas-per-page case; two window-scoped canvases double-fire, so
 *   multi-canvas pages must not use it.
 * - `'root'` — bind to the canvas root element (which `<Canvas>` makes
 *   focusable). Shortcuts fire only while focus is inside that canvas.
 * - `'none'` — no bindings; the host drives the store imperatively.
 */
export type ShortcutScope = 'window' | 'root' | 'none';

/** Options for {@link useKeyboardShortcuts}. */
export interface KeyboardShortcutOptions {
  scope?: ShortcutScope;
  /** The canvas root element, required for `scope: 'root'`. */
  rootRef?: RefObject<HTMLElement | null>;
}

/**
 * Canvas keyboard shortcuts: tool keys, undo/redo (mod+Z / mod+shift+Z /
 * mod+Y), select-all, zoom reset/fit (mod+0 / mod+1), delete and the
 * Escape cascade (exit edit → exit place tool → clear selection). Mounted
 * by `<Canvas>`; see {@link ShortcutScope} for the binding-target policy.
 */
export function useKeyboardShortcuts(options: KeyboardShortcutOptions = {}): void {
  const { scope = 'window', rootRef } = options;
  const instance = useCanvasInstance();
  const { resetZoom, zoomToFit } = useCamera();

  useEffect(() => {
    if (scope === 'none') return;
    const target: EventTarget | null = scope === 'root' ? (rootRef?.current ?? null) : window;
    if (!target) return;

    const handleKeyDown = (e: KeyboardEvent): void => {
      const targetEl = e.target as HTMLElement;
      const inEditable =
        targetEl.isContentEditable ||
        targetEl.tagName === 'INPUT' ||
        targetEl.tagName === 'TEXTAREA';

      const store = instance.getState();

      if (!inEditable) {
        const toolName = TOOL_KEYS[e.key.toLowerCase()];
        if (toolName !== undefined && instance.tools.get(toolName)) {
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

    target.addEventListener('keydown', handleKeyDown as EventListener);
    return () => {
      target.removeEventListener('keydown', handleKeyDown as EventListener);
    };
  }, [instance, resetZoom, zoomToFit, scope, rootRef]);
}
