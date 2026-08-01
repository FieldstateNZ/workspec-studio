import { createContext, useContext } from 'react';

// The host styling spec — the compiled (resolved) style registry the host
// serves (in the enterprise app, GET /projects/:id/spec): each element
// carries a clamped `accent` + icon + shape, the renderer derives
// surface/ink/border from the accent in CSS. An absent key falls back to
// the renderer's built-in accent map. Ported as-is from the enterprise
// `CanvasSpecContext.tsx` (issue #117) — this context is already the clean
// styling seam.

/** Compiled style for one connection category. */
export interface ConnectionStyle {
  /** Compiled accent (clamped). The renderer derives the dark-mode lift in CSS. */
  accent: string;
  style: 'solid' | 'dashed';
}

/** Compiled style for one element kind. */
export interface ElementStyle {
  /** Compiled accent (clamped). All other appearance — surface, ink, border —
   *  is derived from this in CSS on a neutral, theme-aware surface. */
  accent: string;
  icon?: string;
  shape?: 'box' | 'cylinder' | 'pill' | 'hexagon';
  variant?: 'external' | null;
}

/** The full compiled styling spec: connection-key and element-key lookups. */
export interface CanvasSpec {
  connections: Record<string, ConnectionStyle>;
  elements: Record<string, ElementStyle>;
}

/** The default spec: everything falls back to built-in renderer styling. */
export const EMPTY_CANVAS_SPEC: CanvasSpec = { connections: {}, elements: {} };

export const CanvasSpecContext = createContext<CanvasSpec>(EMPTY_CANVAS_SPEC);

/** The active styling spec (EMPTY_CANVAS_SPEC when the host provides none). */
export function useCanvasSpec(): CanvasSpec {
  return useContext(CanvasSpecContext);
}
