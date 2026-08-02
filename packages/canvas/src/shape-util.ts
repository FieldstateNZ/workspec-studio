import type { FC } from 'react';
import type { ZodType } from 'zod';
import type { Box, Shape, Vec2 } from './types.js';

/**
 * The per-shape-type plugin contract — ported from the enterprise
 * `shapes/registry.ts` (#117) and opened up in S2 (#118): the engine
 * consults a shape's util for geometry (`getBounds`), pointer routing
 * (`hitTest`, in shape-LOCAL page-space coordinates), interaction
 * capabilities and rendering (`Component`). The optional capability
 * methods replace the enterprise chrome's hard-coded per-type knowledge
 * (SelectionLayer opt-out list, ConnectorTool's connectable-kind set,
 * ContextMenu's NON_MOVABLE/group-container type sets) so shapes
 * registered by hosts get full chrome behaviour without engine edits.
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
  /**
   * Capability: this shape draws its own selection treatment (halo, twin
   * box-shadow ring, edge highlight), so the SelectionLayer must NOT draw
   * its AABB rect. Replaces the enterprise SelectionLayer's hard-coded
   * opt-out list (connector, flowarrow, c4node, sticky, screen) — the
   * package's connector + sticky utils opt in; enterprise/S3 utils opt in
   * on their own registrations.
   */
  selfRendersSelection?: (shape: S) => boolean;
  /**
   * Capability: the connector tool can start/end an edge on this shape.
   * Replaces the enterprise `isConnectable` type set (c4node /
   * workflownode / diagram-node) — those legacy type names remain
   * recognised as a fallback so enterprise re-adoption works with bare
   * utils (see tools/connector-tool.ts).
   */
  isConnectable?: (shape: S) => boolean;
  /**
   * Capability: the stable host-model key the connector tool hands to
   * `CanvasHost.createEdge` for this endpoint (enterprise: c4node → slug,
   * workflownode → stateKey). Defaults to the shape id.
   */
  connectorKey?: (shape: S) => string;
  /**
   * Capability: this shape is a group container the context menu offers as
   * a "Move to group" target. Replaces the enterprise groupframe /
   * diagram-group type checks; containers also become non-movable
   * themselves (they re-parent via their own containment rules).
   */
  isGroupContainer?: (shape: S) => boolean;
  /** Display label for a group container in the "Move to group" submenu. */
  containerTitle?: (shape: S) => string;
}

/**
 * One registerable shape module (#118): the util plus an optional zod
 * schema for the shape's persisted document form. The engine itself never
 * validates against the schema (snapshot loading is deliberately loose —
 * see store/snapshot.ts); it is registry metadata hosts use to validate
 * imported/synced documents shape-by-shape.
 */
export interface ShapeModule<S extends Shape = Shape> {
  type: string;
  util: ShapeUtil<S>;
  schema?: ZodType;
}

/**
 * Instance-scoped shape-module registry (one per canvas instance),
 * replacing the enterprise's closed module-level `shapeUtils` record.
 * `register` accepts a bare util (a module with no schema) for S1
 * compatibility; `registerModule` is the full S2 surface.
 */
export interface ShapeUtilRegistry {
  /** Register (or replace) the util for its `type` (module without schema). */
  register: <S extends Shape>(util: ShapeUtil<S>) => void;
  /** Register (or replace) a full shape module. */
  registerModule: <S extends Shape>(module: ShapeModule<S>) => void;
  get: (type: string) => ShapeUtil | undefined;
  /** The registered module for `type` (bare-util registrations appear schema-less). */
  getModule: (type: string) => ShapeModule | undefined;
  types: () => readonly string[];
}

/** A fresh, empty shape-module registry (one per canvas instance). */
export function createShapeUtilRegistry(): ShapeUtilRegistry {
  const modules = new Map<string, ShapeModule>();
  // The registry erases the concrete shape type: engine call sites always
  // resolve a util via the shape's own `type`, so the util is only ever
  // invoked with the shape it was registered for. Same erasure the
  // enterprise registry performed with per-entry casts.
  return {
    register: (util) => {
      modules.set(util.type, { type: util.type, util: util as unknown as ShapeUtil });
    },
    registerModule: (module) => {
      modules.set(module.type, module as unknown as ShapeModule);
    },
    get: (type) => modules.get(type)?.util,
    getModule: (type) => modules.get(type),
    types: () => [...modules.keys()],
  };
}
