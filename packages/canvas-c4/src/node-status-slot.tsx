import { createContext, useContext, type ReactNode } from 'react';
import type { C4NodeShape } from './c4-types.js';

/**
 * The node status slot (#119): host-rendered status chrome in the C4
 * card's eyebrow row — where the enterprise rendered its PR-review overlay
 * chips (Added/Changed/Removed + open-comment count from PrOverlayContext,
 * with wouter navigation). That whole block is enterprise-host concern, so
 * it became this render prop with a no-op default; the generic DRAFT chip
 * and rework halo stay in the card (they're driven by shape fields).
 *
 * ```tsx
 * <C4NodeStatusSlot.Provider value={(shape) => <MyPrChips shape={shape} />}>
 * ```
 */
export type C4NodeStatusRenderer = (shape: C4NodeShape) => ReactNode;

const noStatus: C4NodeStatusRenderer = () => null;

export const C4NodeStatusSlot = createContext<C4NodeStatusRenderer>(noStatus);

/** The active status renderer (no-op when the host provides none). */
export function useC4NodeStatus(): C4NodeStatusRenderer {
  return useContext(C4NodeStatusSlot);
}
