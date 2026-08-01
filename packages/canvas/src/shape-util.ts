import type { FC } from 'react';
import type { Box, Shape, Vec2 } from './types.js';

/**
 * The per-shape-type plugin contract — ported from the enterprise
 * `shapes/registry.ts` and kept deliberately minimal in S1 (#117): the
 * concrete shape utils and the full open `ShapeModule` registration
 * surface arrive in S2. The engine consults a shape's util for geometry
 * (`getBounds`), pointer routing (`hitTest`, in shape-LOCAL page-space
 * coordinates), interaction capabilities (`canResize`, `canEditText`) and
 * rendering (`Component`).
 */
export interface ShapeUtil<S extends Shape = Shape> {
  type: string;
  /** Fresh shape fields for a creation gesture at `point` (id/index are minted by the caller). */
  defaultProps: (point: Vec2) => Omit<S, 'id' | 'index'>;
  getBounds: (shape: S) => Box;
  hitTest: (shape: S, localPoint: Vec2) => boolean;
  canResize: (shape: S) => boolean;
  canEditText: (shape: S) => boolean;
  Component: FC<{ shape: S; isEditing: boolean }>;
  /**
   * Capability: right-clicking EMPTY canvas inside this shape's rect opens
   * the container-level context menu even though `hitTest` returns false
   * (the shape is pointer-through). Replaces the enterprise Canvas's
   * hard-coded `'c4_boundary'` id check (#117) — the C4 boundary util
   * (S3) opts in; everything else leaves it unset.
   */
  isContextMenuSurface?: (shape: S) => boolean;
}

/**
 * Instance-scoped lookup of shape utils by type string. Replaces the
 * enterprise's module-level `shapeUtils` record so two canvases on one
 * page can register different shape sets. S2's module registration API
 * builds on top of this.
 */
export interface ShapeUtilRegistry {
  /** Register (or replace) the util for its `type`. */
  register: <S extends Shape>(util: ShapeUtil<S>) => void;
  get: (type: string) => ShapeUtil | undefined;
  types: () => readonly string[];
}

/** A fresh, empty shape-util registry (one per canvas instance). */
export function createShapeUtilRegistry(): ShapeUtilRegistry {
  const utils = new Map<string, ShapeUtil>();
  return {
    register: (util) => {
      // The registry erases the concrete shape type: engine call sites
      // always resolve a util via the shape's own `type`, so the util is
      // only ever invoked with the shape it was registered for. Same
      // erasure the enterprise registry performed with per-entry casts.
      utils.set(util.type, util as unknown as ShapeUtil);
    },
    get: (type) => utils.get(type),
    types: () => [...utils.keys()],
  };
}
