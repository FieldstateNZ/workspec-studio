import type { ShapeId } from './types.js';

/**
 * The host persistence seam — the generic core of the enterprise
 * `c4Bridge` (issue #117; the full C4 extension arrives with
 * `@workspec/canvas-c4` in S3). A host installs callbacks on
 * `CanvasStoreInstance.host`; every callback is optional, and the
 * fallback semantics are LOAD-BEARING contract:
 *
 * > A missing callback, or one returning `false`/`undefined`, means the
 * > host did NOT handle the mutation — the store falls through to its own
 * > local, undoable edit. Returning `true` means the host owned it
 * > (optimistic update + server write) and the store skips its default.
 *
 * On browser-local canvases the local fallback IS persistence (via the
 * snapshot subscription), so a host that installs nothing gets the full
 * whiteboard behaviour for free.
 */
export interface CanvasHost {
  /**
   * Delete the given canvas shapes (with any host-side cascade). Return
   * true if handled (the store then skips its default local removal);
   * false/undefined falls back to the store's own undoable delete.
   */
  deleteShapes?: (ids: ShapeId[]) => boolean;
  /**
   * Persist an inline label edit on a shape by ShapeId. Return true when
   * handled (host's own optimistic store update + server write); false
   * falls back to a local label update.
   */
  renameShape?: (id: ShapeId, label: string) => boolean;
  /**
   * Re-parent shapes into a group container (null = remove from group).
   * Return true when the host handled persistence; false falls back to a
   * local undoable containerId update.
   */
  moveToContainer?: (ids: ShapeId[], containerId: string | null) => boolean;
  /** Re-arrange the contained nodes and persist the new layout (host-defined algorithm). */
  autoLayout?: () => void;
}
