import { createContext, useContext } from 'react';

/**
 * The measured canvas viewport — the seam that replaces every
 * window-inner-size and `[data-canvas-root]` document-query read in the
 * enterprise source (issue #117). `<Canvas>` measures its own root
 * element (ResizeObserver-tracked) and provides this; camera fitting,
 * layer culling (S2) and chrome read it, so an embedded canvas panel
 * fits/culls against ITS rect, not the window.
 */
export interface CanvasViewport {
  /** Root element width in CSS pixels (0 until first measure). */
  width: number;
  /** Root element height in CSS pixels (0 until first measure). */
  height: number;
  /** Live root rect (for client→canvas coordinate translation); null before mount. */
  getRect: () => DOMRect | null;
}

export const CanvasViewportContext = createContext<CanvasViewport | null>(null);

/**
 * The enclosing `<Canvas>`'s measured viewport, or null when used outside
 * a canvas (callers must treat null/zero-size as "not measurable yet" and
 * no-op rather than guessing a window size).
 */
export function useCanvasViewport(): CanvasViewport | null {
  return useContext(CanvasViewportContext);
}
