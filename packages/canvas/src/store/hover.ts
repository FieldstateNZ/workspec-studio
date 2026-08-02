import { createStore, type StoreApi } from 'zustand/vanilla';
import type { ShapeId } from '../types.js';

/**
 * Ephemeral hover state — deliberately separate from the main canvas store
 * so hover changes (every pointermove) never trip the persistence
 * subscribers (localStorage / backend canvas saves). Drives the connector
 * + node hover highlighting (hover a line → its endpoint nodes light up,
 * and vice versa). Instance-scoped (`CanvasStoreInstance.hover`) rather
 * than the enterprise's module singleton, per issue #117.
 */
export interface CanvasHoverState {
  hoveredId: ShapeId | null;
  setHovered: (id: ShapeId | null) => void;
}

/** A fresh hover store (one per canvas instance). */
export function createHoverStore(): StoreApi<CanvasHoverState> {
  return createStore<CanvasHoverState>((set) => ({
    hoveredId: null,
    // Same-value writes return the previous state object so subscribers
    // (and React's useSyncExternalStore) skip the update entirely.
    setHovered: (id) => set((s) => (s.hoveredId === id ? s : { hoveredId: id })),
  }));
}
