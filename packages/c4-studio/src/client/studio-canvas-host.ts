// The studio's C4CanvasHost: the full enterprise host bridge, wired to the
// c4-studio write API (issue #132). A standalone module by design — the A1
// page shell imports `installStudioCanvasHost` and installs it on the
// canvas instance it mounts; nothing here touches the shell, the explorer,
// or any component.
//
// The load-bearing semantics are the bridge contract's OPTIMISTIC-LOCAL
// rules (see `@workspec/c4-ui`'s c4-host contract tests): components apply
// their local, undoable store edit FIRST, then notify the host. So every
// boolean core callback here returns `false` — the local edit always
// proceeds immediately — while the server write rides alongside; when it
// settles, `onMutated` lets the shell refetch the model and reconcile, and
// a rejection surfaces through `onWriteError` (the shell's write-error
// banner, same pattern as `C4Diagram`'s layout-write banner).

import { generateKeyBetween } from '@workspec/canvas';
import type { CanvasStoreInstance, Shape, ShapeId, Vec2 } from '@workspec/canvas';
import { C4_NODE_HEIGHT, C4_NODE_WIDTH, nodeShapeId } from '@workspec/c4-ui';
import type { C4CanvasHost, C4NodeMeta, C4NodeShape } from '@workspec/c4-ui';
import { ELEMENT_KINDS } from '@workspec/c4-model';
import type { ElementKind } from '@workspec/c4-model';
import { SYSTEM_ALIAS } from '@workspec/c4-schema';
import type { MutationApi } from './mutation-api.types.js';

/** Everything the shell provides when installing the studio host. */
export interface StudioCanvasHostOptions {
  /**
   * The slug of the diagram this canvas is currently editing. A function,
   * not a value: the shell switches diagrams on one long-lived canvas
   * instance, and every mutation must land on the diagram showing at
   * gesture time.
   */
  readonly diagramSlug: () => string;
  /** The write API (normally `createMutationApi()`; tests pass a fake). */
  readonly api: MutationApi;
  /** Surfaces a failed write's message — feed the shell's write-error banner. */
  readonly onWriteError?: (message: string) => void;
  /**
   * Called after any server write lands. The shell should refetch
   * `GET /api/model` and re-project — that reconciliation is what
   * ultimately confirms (or corrects) the optimistic local edit.
   */
  readonly onMutated?: () => void;
  /**
   * Converts the point `placeNode` is handed into canvas PAGE coordinates.
   *
   * DEFAULTS TO IDENTITY, because the shared place tool already hands over
   * page coordinates: `createPlaceTool` calls `host.placeNode` with
   * `{ x: e.pageX, y: e.pageY }` (place-tool.ts:20), and `CanvasPointerEvent.pageX`
   * is world space — `use-pointer-events.ts:16` builds it by running the
   * raw client point through `screenToPage` before any tool sees it. The
   * pre-A3 default applied `screenToPage` a SECOND time, so at any zoom or
   * pan other than the identity camera a placed card landed away from the
   * cursor (harmless in A2, which had no palette to place from).
   *
   * Supply an override only for a caller that invokes `placeNode` with
   * something other than the place tool's point.
   */
  readonly toPagePoint?: (point: Vec2) => Vec2;
  /** Navigate one level deeper (shell-owned navigation). */
  readonly drillDown?: (slug: string) => void;
  /** Enter the node's architecture room (shell-owned navigation). */
  readonly enterRoom?: (slug: string, label: string, nodeType: string) => void;
  /** Open the element editor panel (A3 surface; shell-owned). */
  readonly openElementEditor?: C4CanvasHost['openElementEditor'];
  /**
   * Override for the auto-layout action. Default: clear the diagram's
   * `.layout/` pins via the API — with no pins, the next model load lays
   * the diagram out fresh, which is what auto-layout MEANS in a
   * file-backed model.
   */
  readonly autoLayout?: () => void;
}

/** Narrows a canvas `nodeType` string to a creatable/locatable element kind. */
function asElementKind(nodeType: string): ElementKind | null {
  return (ELEMENT_KINDS as readonly string[]).includes(nodeType) ? (nodeType as ElementKind) : null;
}

/**
 * Builds the full studio {@link C4CanvasHost} against the write API and
 * installs it on `instance.host` (one object, one seam — the engine's core
 * callbacks and the C4 extras must ride the same object, per the c4-host
 * contract tests). Returns the host for direct use in tests.
 *
 * Per-callback mapping, and where each deviates from a plain pass-through:
 *
 * - `commitNewNode` → `POST /api/elements` with the current diagram and
 *   the pending card's position, so the new element file, its diagram node
 *   ref, and its `.layout/` pin land in one call.
 * - `renameNode` → `PATCH /api/elements` (title only — slug is stable, see
 *   the server's `updateElement`). The node's `meta.elementSlug` wins over
 *   its nodeId so aliased/fat nodes rename their real element.
 * - `deleteShapes` → `DELETE /api/diagram-nodes` per c4node and
 *   `DELETE /api/relations` per connector, returning `false` so the
 *   store's own undoable delete gives instant feedback. The gesture is
 *   DIAGRAM-SCOPED (enterprise parity, A2 review lead ruling): it removes
 *   the node ref, its touching edges, and this diagram's layout entries —
 *   the element FILE survives. The tree-wide `api.deleteElement` ("delete
 *   element everywhere") is deliberately NOT bound to any canvas gesture;
 *   A3 surfaces it as an explicit, confirmed action. Pending (never
 *   persisted) and resolver-injected shapes are skipped server-side.
 * - `createEdge`/`renameEdge` → relation routes; endpoint keys are element
 *   slugs (`c4node`'s `connectorKey`).
 * - `renameShape`/`moveToContainer` → `false`: C4 renames arrive via
 *   `renameNode`, and boundary membership is derived from the model, so
 *   both stay local-only.
 * - `placeNode` → a local `pending` card with the inline name editor open;
 *   nothing is written until `commitNewNode` names it (Escape discards).
 */
export function installStudioCanvasHost(
  instance: CanvasStoreInstance,
  options: StudioCanvasHostOptions,
): C4CanvasHost {
  let pendingCounter = 0;

  const report = (error: unknown): void => {
    options.onWriteError?.(error instanceof Error ? error.message : String(error));
  };
  const refetch = (): void => {
    options.onMutated?.();
  };
  const c4NodeAt = (id: ShapeId): C4NodeShape | null => {
    const shape: Shape | undefined = instance.getState().shapes[id];
    return shape !== undefined && shape.type === 'c4node' ? (shape as C4NodeShape) : null;
  };

  const host: C4CanvasHost = {
    commitNewNode: (nodeType, name, point) => {
      const kind = asElementKind(nodeType);
      if (kind === null) {
        options.onWriteError?.(`"${nodeType}" is not a creatable element kind`);
        return;
      }
      options.api
        .createElement({ kind, name, diagram: options.diagramSlug(), position: point })
        .then(refetch)
        .catch(report);
    },

    renameNode: (slug, name) => {
      const shape = c4NodeAt(nodeShapeId(slug));
      const meta = (shape?.meta ?? {}) as C4NodeMeta;
      const elementSlug = meta.elementSlug ?? slug;
      if (elementSlug === SYSTEM_ALIAS) {
        options.onWriteError?.('the __system__ alias cannot be renamed; rename the system element');
        return;
      }
      const kind = shape !== null ? asElementKind(shape.nodeType) : null;
      options.api
        .updateElement({ slug: elementSlug, ...(kind !== null ? { kind } : {}), name })
        .then(refetch)
        .catch(report);
    },

    deleteShapes: (ids) => {
      const state = instance.getState();
      const jobs: Promise<unknown>[] = [];
      for (const id of ids) {
        const shape: Shape | undefined = state.shapes[id];
        if (shape === undefined) continue;
        if (shape.type === 'c4node') {
          const node = shape as C4NodeShape;
          const meta = (node.meta ?? {}) as C4NodeMeta;
          if (meta.pending === true) continue; // never persisted — nothing to delete
          if (meta.injected === true) {
            options.onWriteError?.(
              `"${node.label}" is injected by the resolver and has no node entry to delete here`,
            );
            continue;
          }
          // Diagram-scoped by ruling: the ref as this diagram authored it
          // (the nodeId), never meta.elementSlug — the diagram file keys
          // its node entries by what it wrote.
          jobs.push(
            options.api.removeDiagramNode({ diagram: options.diagramSlug(), node: node.slug }),
          );
        } else if (shape.type === 'connector') {
          const { edgeFrom, edgeTo } = shape;
          if (typeof edgeFrom === 'string' && typeof edgeTo === 'string') {
            jobs.push(
              options.api.deleteRelation({
                diagram: options.diagramSlug(),
                from: edgeFrom,
                to: edgeTo,
              }),
            );
          }
        }
        // Boundaries (and anything else) are derived — no file to touch.
      }
      if (jobs.length > 0) {
        void Promise.allSettled(jobs).then((results) => {
          const rejected = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
          if (rejected !== undefined) report(rejected.reason);
          if (results.some((r) => r.status === 'fulfilled')) refetch();
        });
      }
      // false = the store's own undoable local delete proceeds (optimistic).
      return false;
    },

    renameShape: () => false,
    moveToContainer: () => false,

    createEdge: (fromKey, toKey) => {
      options.api
        .createRelation({ diagram: options.diagramSlug(), from: fromKey, to: toKey })
        .then(refetch)
        .catch(report);
    },

    renameEdge: (fromKey, toKey, label) => {
      options.api
        .renameRelation({ diagram: options.diagramSlug(), from: fromKey, to: toKey, label })
        .then(refetch)
        .catch(report);
    },

    autoLayout:
      options.autoLayout ??
      (() => {
        options.api.clearLayout(options.diagramSlug()).then(refetch).catch(report);
      }),

    placeNode: (nodeType, point) => {
      const page = options.toPagePoint?.(point) ?? point;
      pendingCounter += 1;
      const slug = `pending-${String(pendingCounter)}`;
      const id = nodeShapeId(slug);
      const state = instance.getState();
      const indexes = Object.values(state.shapes)
        .map((s) => s.index)
        .sort();
      const shape: C4NodeShape = {
        id,
        type: 'c4node',
        index: generateKeyBetween(indexes[indexes.length - 1] ?? null, null),
        x: page.x - C4_NODE_WIDTH / 2,
        y: page.y - C4_NODE_HEIGHT / 2,
        width: C4_NODE_WIDTH,
        height: C4_NODE_HEIGHT,
        slug,
        nodeType,
        label: '',
        meta: { pending: true, slug },
      };
      state.createShape(shape);
      state.select([id], 'replace');
      state.setEditing(id);
    },

    ...(options.drillDown !== undefined ? { drillDown: options.drillDown } : {}),
    ...(options.enterRoom !== undefined ? { enterRoom: options.enterRoom } : {}),
    ...(options.openElementEditor !== undefined
      ? { openElementEditor: options.openElementEditor }
      : {}),
  };

  instance.host = host;
  return host;
}
