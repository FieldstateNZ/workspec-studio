/* eslint-disable @typescript-eslint/consistent-type-definitions --
   2026-08-02, canvas port (S1, #117): `BaseShape` MUST be a `type` alias,
   not an interface. The open shape model
   (`Shape = BaseShape & Record<string, unknown>`) relies on TypeScript's
   implicit index signatures, which object-literal type aliases get and
   interfaces do not — an interface in a shape's own composition makes
   every concrete shape unassignable to `Shape` ("Index signature for type
   'string' is missing"). Everything else in this file that CAN be an
   interface is one; remove this disable if the Shape record ever becomes
   a closed union again. */

// Core engine types for @workspec/canvas — ported from the enterprise
// canvas `types.ts` (workspec/artifacts/workspec/src/canvas). This is the
// SPLIT surface agreed in issue #117: geometry/camera/command/history/base
// shape plus the generic tool/marquee types live here; the concrete
// whiteboard + connector shape contracts live in `shape-types.ts`;
// enterprise-only shapes and fields (drafted, validationErrors,
// artifactRefId, canvasObjectId, reworking, atlas*, cost*) stay in the
// enterprise repo and return later via module shape defs / `meta`.

/** A 2D point or vector in either page or screen space. */
export interface Vec2 {
  x: number;
  y: number;
}

/** An axis-aligned rectangle (page or screen space, per call site). */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The viewport camera: `x`/`y` are the PAGE-space coordinates of the
 * canvas's top-left corner, `zoom` the page→screen scale factor
 * (`screen = (page − camera) × zoom`, see `utils/transforms.ts`).
 */
export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

/**
 * Branded shape identifier. The brand prevents accidentally passing an
 * arbitrary string where a shape id is required; mint real ids with
 * `createShapeId()` (utils/ids.ts) or brand explicitly at a trusted
 * boundary (e.g. snapshot load).
 */
export type ShapeId = string & { __brand: 'ShapeId' };

/**
 * The fields every canvas shape carries. Concrete shape contracts extend
 * this via intersection (`BaseShape & { type: 'sticky'; … }`) — see
 * `shape-types.ts` and the open `Shape` record below.
 */
export type BaseShape = {
  id: ShapeId;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Fractional z-order key (utils/fractional-index.ts); sort ascending to render back→front. */
  index: string;
  /** Clockwise degrees; absent/0 = upright. */
  rotation?: number;
  /**
   * Flat multi-select bond: clicking any member selects all members.
   * Declared `| undefined` (not just optional) because ungroup restores the
   * pre-group state by writing `undefined` back onto the shape.
   */
  groupId?: string | undefined;
  /**
   * Containment parent — the id of a shape (a group) that visually encloses
   * this one, forming a nesting tree. Distinct from `groupId` (a flat
   * multi-select bond): containerId drives "drag the container, its
   * contents follow" and delete-cascade semantics (utils/containers.ts).
   * Unset on canvases that never nest, so it's inert there.
   */
  containerId?: string;
  /**
   * Host/module side-channel. Two keys are load-bearing engine contract:
   * `meta.ephemeral` (true = projection of a remote model; excluded from
   * `exportSnapshot()` so it never leaks into persisted snapshots) — see
   * the store docs. Everything else is module-owned.
   */
  meta?: Record<string, unknown>;
  /**
   * Structured-lens offset relative to freeform position. Absent =
   * anchored. Declared `| undefined` because undoing a structured-lens
   * drag restores the exact original state, which may be "no offset".
   */
  lensOffset?: { dx: number; dy: number } | undefined;
};

/**
 * The store-level shape record: base fields plus module-owned fields the
 * engine treats as opaque. This replaces the enterprise's closed 20-member
 * union — shape modules (S2+) own the narrowing from `Shape` to their
 * concrete contract (e.g. via `shape.type` checks against their registered
 * type string).
 */
export type Shape = BaseShape & Record<string, unknown>;

/** The two view lenses: `freeform` renders stored x/y, `structured` adds each shape's `lensOffset`. */
export type LensMode = 'freeform' | 'structured';

/**
 * The tools the engine knows keyboard/cursor defaults for, kept open so
 * hosts can register their own (the tool registry is instance-scoped —
 * see `CanvasStoreInstance.tools`). The `string & Record<never, never>`
 * arm keeps arbitrary names assignable without collapsing the known
 * literals out of editor autocomplete.
 */
export type ToolName =
  | 'select'
  | 'hand'
  | 'sticky'
  | 'text'
  | 'draw'
  | 'connector'
  | 'place'
  | (string & Record<never, never>);

/**
 * One undoable mutation: `do`/`undo` are pure functions over the whole
 * shape record. Live drags mutate raw (`_setShapesRaw`) and commit one
 * Command per gesture so the entire gesture is one undo step.
 */
export interface Command {
  do: (shapes: Record<ShapeId, Shape>) => Record<ShapeId, Shape>;
  undo: (shapes: Record<ShapeId, Shape>) => Record<ShapeId, Shape>;
  label?: string;
}

/** The undo/redo stack: `pointer` indexes the last-applied command (−1 = empty). */
export interface HistoryStack {
  stack: Command[];
  pointer: number;
}

/** Live marquee-selection rectangle in page space (start = anchor, end = cursor). */
export interface MarqueeState {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}
