import type { BaseShape, CanvasHost, CanvasStoreInstance } from '@workspec/canvas';

// The C4 shape contracts — module-owned narrowing over @workspec/canvas's
// open Shape record (S2 registry design). Ported from the enterprise
// `types.ts` C4 members with the S3 field split (#119): fields that DRIVE
// the ported card chrome stay first-class; enterprise-host data the studio
// model lacks (validationErrors, artifactRefId) lives in `meta` (see
// {@link C4NodeMeta}).

/** One schema-validation issue on a node's backing artifact. */
export interface C4ValidationError {
  path: string;
  message: string;
  code?: string;
}

/**
 * The `meta` protocol on C4 shapes. `ephemeral` + `slug` are set by the
 * projection; the rest are host-owned flags layered on afterwards:
 *
 * - `inBoundary` — tagged by the projection on contained nodes so a host's
 *   live boundary reflow can recompute the panel from its contents.
 * - `pending` — a locally-created node that hasn't been named/persisted
 *   yet (drives the inline name editor + commitNewNode).
 * - `dimmed` — the spotlight flag. The CURRENT enterprise projection never
 *   sets it (it dimmed outside-boundary actors/externals in an earlier
 *   revision — enterprise commit 14c4b5c9, removed in d783789e); the card
 *   still renders it (grayscale + brightness drop), so hosts can re-enable
 *   spotlighting by writing it.
 * - `validationErrors` / `artifactRefId` — enterprise-host artifact data
 *   the studio's ResolvedDiagram doesn't carry; drives the validity
 *   markers + element-editor opening when present.
 */
export interface C4NodeMeta {
  ephemeral?: boolean;
  slug?: string;
  /** The resolved ELEMENT slug when it differs from the nodeId (fat/aliased nodes). */
  elementSlug?: string;
  inBoundary?: boolean;
  pending?: boolean;
  dimmed?: boolean;
  validationErrors?: C4ValidationError[];
  artifactRefId?: string | null;
  /** Studio ResolvedDiagramNode extras, carried through for host chrome. */
  technology?: string | null;
  tags?: readonly string[];
  injected?: boolean;
  dangling?: boolean;
  [key: string]: unknown;
}

/** A C4 node card (fixed 300×110 geometry — see c4-node-shape-util.ts). */
export type C4NodeShape = BaseShape & {
  type: 'c4node';
  /** The node's stable model identity (element slug / nodeId) — edge endpoints + layout keys. */
  slug: string;
  /** Element kind (system/actor/container/…) driving accent, icon, label. */
  nodeType: string;
  label: string;
  description?: string | undefined;
  /** True when a deeper diagram exists (or can be created) for this node — shows ROOM + drill. */
  drillable?: boolean;
  /** Git-native "pencil" state: uncommitted changes on the viewer's draft branch. */
  drafted?: boolean;
  /** True when this node is the C4 view's in-scope subject (data-scope="focus" tint). */
  isScope?: boolean;
  /** Flagged for rework (dashed orange halo + footer toggle). */
  reworking?: boolean;
  /** Host canvas-object row id backing the rework toggle (null = no row → no footer). */
  canvasObjectId?: string | null;
};

/** The derived system/container boundary panel. */
export type C4BoundaryShape = BaseShape & {
  type: 'c4boundary';
  label: string;
  /** Compiled accent for fill/border/label (the boundary derives its tints inline). */
  accent: string;
};

/**
 * The C4 host bridge — the full enterprise `c4Bridge` surface, layered on
 * `@workspec/canvas`'s CanvasHost (which already carries createEdge /
 * renameEdge / placeNode / deleteShapes / moveToContainer / renameShape /
 * autoLayout from S2). Install on `instance.host`. Every callback is
 * optional; the load-bearing enterprise semantics are OPTIMISTIC-LOCAL:
 * the components apply their local (undoable where applicable) store edit
 * first, then notify the host — a missing callback simply means the edit
 * stays local (see the c4-host contract tests).
 */
export interface C4CanvasHost extends CanvasHost {
  /** Persist a pending node's first name (slugified name becomes id/filename). */
  commitNewNode?: (nodeType: string, name: string, point: { x: number; y: number }) => void;
  /** Persist a rename of an existing node (called AFTER the optimistic local label update). */
  renameNode?: (slug: string, name: string) => void;
  /** Navigate one level deeper into this node's diagram. */
  drillDown?: (slug: string) => void;
  /** Enter the node's architecture ROOM (tethered navigation). */
  enterRoom?: (slug: string, label: string, nodeType: string) => void;
  /** Toggle the rework flag on the node's canvas-object row. */
  toggleReworking?: (canvasObjectId: string, current: boolean) => void;
  /**
   * Open the host's element editor (name + description) for a node's
   * artifact. Replaces the enterprise `workspec:open-c4-element-editor`
   * window CustomEvent (declared deviation, #119) — a host callback keeps
   * multi-canvas pages sane and the package window-global-free.
   */
  openElementEditor?: (payload: {
    artifactRefId: string;
    slug: string;
    label: string;
    description: string;
    validationErrors: C4ValidationError[];
  }) => void;
}

/**
 * The instance's host, viewed through the C4 contract. `instance.host` is
 * typed as the generic CanvasHost; the C4 methods are structural extras
 * this C4 layer reads off the same object.
 */
export function getC4Host(instance: CanvasStoreInstance): C4CanvasHost {
  return instance.host as C4CanvasHost;
}
