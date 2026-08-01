import { createStore } from 'zustand/vanilla';
import type { Command, Shape, ShapeId, ToolName } from '../types.js';
import { createHistory, executeCommand, undoCommand, redoCommand } from '../utils/history.js';
import { computeAlignDistribute } from '../utils/align-distribute.js';
import { withDescendants } from '../utils/containers.js';
import { defaultKindResolver } from '../kind-resolver.js';
import type { CanvasHost } from '../canvas-host.js';
import { createShapeUtilRegistry } from '../shape-util.js';
import { createSelectTool } from '../tools/select-tool.js';
import { createHoverStore } from './hover.js';
import { loadSnapshotFromStorage, type CanvasSnapshot } from './snapshot.js';
import { createToolRegistry } from './tool-registry.js';
import {
  applyIndexPatch,
  computeBringForward,
  computeBringToFront,
  computeSendBackward,
  computeSendToBack,
  type ZOrderPatch,
} from './z-order.js';
import type {
  CanvasStore,
  CanvasStoreInstance,
  CanvasStoreOptions,
} from './store.types.js';

const SAVE_DEBOUNCE_MS = 800;
const LENS_SWITCH_MS = 280;

/**
 * Copy `shapes` without the given ids. Local stand-in for the enterprise's
 * in-place `delete next[id]` loops (computed `delete` is banned by the
 * studio lint); same result, same complexity (both copy the record).
 */
function omitShapes(
  shapes: Record<ShapeId, Shape>,
  ids: Iterable<ShapeId>,
): Record<ShapeId, Shape> {
  const omit = new Set<string>(ids);
  const next: Record<ShapeId, Shape> = {};
  for (const [id, shape] of Object.entries(shapes)) {
    if (!omit.has(id)) next[id as ShapeId] = shape;
  }
  return next;
}

/** Build the undoable command for one z-order patch (do = new keys, undo = previous keys). */
function zOrderCommand(label: string, patch: ZOrderPatch): Command {
  return {
    label,
    do: (s) => applyIndexPatch(s, patch.newIndices),
    undo: (s) => applyIndexPatch(s, patch.prevIndices),
  };
}

/**
 * Create one canvas instance: a vanilla zustand v5 store carrying the
 * whole engine state plus the formerly-module-level singletons (tool
 * registry, shape-util registry, hover store, host bridge, save/lens
 * timers) — the singleton→factory rewrite of the enterprise
 * `useCanvasStore` (issue #117). Two instances on one page share nothing.
 *
 * Mount it with `<CanvasProvider store={instance}>`; components read it
 * through `useCanvasStore(selector)` (identical call signature to the
 * enterprise hook). The select tool is pre-registered so a fresh instance
 * is interactive; further tools register via `instance.tools` (S2 ships
 * the full set).
 */
export function createCanvasStore(options: CanvasStoreOptions = {}): CanvasStoreInstance {
  // The host bridge is read through this ref by the actions below so
  // `instance.host = …` (see the accessor at the bottom) swaps callbacks
  // without rebuilding the store.
  const hostRef: { current: CanvasHost } = { current: options.host ?? {} };

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let lensSwitchTimer: ReturnType<typeof setTimeout> | null = null;
  // Auto-clear timers spawned by highlight/markRecent — tracked so
  // dispose() can cancel them (they were fire-and-forget module timers in
  // the enterprise source).
  const effectTimers = new Set<ReturnType<typeof setTimeout>>();

  const persisted =
    options.persistenceKey === undefined ? {} : loadSnapshotFromStorage(options.persistenceKey);

  const store = createStore<CanvasStore>()((set, get) => ({
    camera: persisted.camera ?? { x: 0, y: 0, zoom: 1 },
    shapes: persisted.shapes ?? {},
    selectedIds: new Set<ShapeId>(),
    hoveredId: null,
    editingId: null,
    activeTool: 'select' as ToolName,
    placementNodeType: null,
    history: createHistory(),
    marquee: null,
    isDragging: false,
    isResizing: false,
    focusIds: null,
    highlightIds: new Set<ShapeId>(),
    recentIds: new Set<ShapeId>(),
    hiddenKinds: new Set<string>(),
    viewportIntent: 'reset' as const,
    lens: 'freeform' as const,
    isLensSwitching: false,

    createShape: (shape) => {
      const cmd: Command = {
        label: 'Create shape',
        do: (shapes) => ({ ...shapes, [shape.id]: shape }),
        undo: (shapes) => omitShapes(shapes, [shape.id]),
      };
      const { history, shapes } = get();
      const result = executeCommand(history, shapes, cmd);
      set({ shapes: result.shapes, history: result.history });
    },

    updateShape: (id, patch) => {
      const prev = get().shapes[id];
      if (!prev) return;
      const updated: Shape = { ...prev, ...patch };
      const cmd: Command = {
        label: 'Update shape',
        do: (shapes) => ({ ...shapes, [id]: updated }),
        undo: (shapes) => ({ ...shapes, [id]: prev }),
      };
      const { history, shapes } = get();
      const result = executeCommand(history, shapes, cmd);
      set({ shapes: result.shapes, history: result.history });
    },

    deleteShapes: (ids) => {
      // Hosts that persist deletions server-side own it when installed
      // (returns true once handled, so we skip the default local removal
      // below). Canvases with no host fall through to the normal undoable
      // delete — see the CanvasHost fallback contract.
      if (hostRef.current.deleteShapes?.(ids)) return;
      const { shapes, history } = get();
      // Containment: deleting a frame takes its children with it.
      const allIds = withDescendants(shapes, ids);
      const deleted: Record<ShapeId, Shape> = {};
      for (const id of allIds) {
        const shape = shapes[id];
        if (shape) deleted[id] = shape;
      }
      const cmd: Command = {
        label: 'Delete shapes',
        do: (s) => omitShapes(s, allIds),
        undo: (s) => ({ ...s, ...deleted }),
      };
      const result = executeCommand(history, shapes, cmd);
      set({
        shapes: result.shapes,
        history: result.history,
        selectedIds: new Set<ShapeId>(),
        editingId: null,
      });
    },

    moveShapes: (ids, dx, dy) => {
      const { shapes, history } = get();
      // Containment: a frame drags its children along.
      const allIds = withDescendants(shapes, ids);
      const prevPositions: Record<ShapeId, { x: number; y: number }> = {};
      for (const id of allIds) {
        const s = shapes[id];
        if (s) prevPositions[id] = { x: s.x, y: s.y };
      }
      const cmd: Command = {
        label: 'Move shapes',
        do: (s) => {
          const next = { ...s };
          for (const id of allIds) {
            const shape = next[id];
            if (shape) next[id] = { ...shape, x: shape.x + dx, y: shape.y + dy };
          }
          return next;
        },
        undo: (s) => {
          const next = { ...s };
          for (const id of allIds) {
            const shape = next[id];
            const prev = prevPositions[id];
            if (shape && prev) next[id] = { ...shape, x: prev.x, y: prev.y };
          }
          return next;
        },
      };
      const result = executeCommand(history, shapes, cmd);
      set({ shapes: result.shapes, history: result.history });
    },

    resizeShape: (id, newBounds) => {
      const { shapes, history } = get();
      const prev = shapes[id];
      if (!prev) return;
      const updated: Shape = { ...prev, ...newBounds };
      const cmd: Command = {
        label: 'Resize shape',
        do: (s) => ({ ...s, [id]: updated }),
        undo: (s) => ({ ...s, [id]: prev }),
      };
      const result = executeCommand(history, shapes, cmd);
      set({ shapes: result.shapes, history: result.history });
    },

    alignDistribute: (ids) => {
      const { shapes, history } = get();
      const selected = ids
        .map((id) => shapes[id])
        .filter((s): s is Shape => s !== undefined);
      const targets = computeAlignDistribute(selected);
      if (targets.size === 0) return;

      const prev: Record<ShapeId, { x: number; y: number }> = {};
      for (const id of targets.keys()) {
        const s = shapes[id];
        if (s) prev[id] = { x: s.x, y: s.y };
      }
      const cmd: Command = {
        label: 'Align & distribute',
        do: (s) => {
          const next = { ...s };
          for (const [id, pos] of targets) {
            const shape = next[id];
            if (shape) next[id] = { ...shape, x: pos.x, y: pos.y };
          }
          return next;
        },
        undo: (s) => {
          const next = { ...s };
          for (const [id, pos] of Object.entries(prev)) {
            const shape = next[id as ShapeId];
            if (shape) next[id as ShapeId] = { ...shape, x: pos.x, y: pos.y };
          }
          return next;
        },
      };
      // Bracket the command in a drag transition so position-save
      // subscribers (e.g. a host's layout PATCH) persist the new layout —
      // align & distribute is a programmatic move gesture.
      set({ isDragging: true });
      const result = executeCommand(history, shapes, cmd);
      set({ shapes: result.shapes, history: result.history });
      set({ isDragging: false });
    },

    bringToFront: (ids) => {
      const { shapes, history } = get();
      const patch = computeBringToFront(shapes, ids);
      const result = executeCommand(history, shapes, zOrderCommand('Bring to front', patch));
      set({ shapes: result.shapes, history: result.history });
    },

    sendToBack: (ids) => {
      const { shapes, history } = get();
      const patch = computeSendToBack(shapes, ids);
      const result = executeCommand(history, shapes, zOrderCommand('Send to back', patch));
      set({ shapes: result.shapes, history: result.history });
    },

    bringForward: (ids) => {
      const { shapes, history } = get();
      const patch = computeBringForward(shapes, ids);
      if (!patch) return;
      const result = executeCommand(history, shapes, zOrderCommand('Bring forward', patch));
      set({ shapes: result.shapes, history: result.history });
    },

    sendBackward: (ids) => {
      const { shapes, history } = get();
      const patch = computeSendBackward(shapes, ids);
      if (!patch) return;
      const result = executeCommand(history, shapes, zOrderCommand('Send backward', patch));
      set({ shapes: result.shapes, history: result.history });
    },

    groupShapes: (ids) => {
      const { shapes, history } = get();
      const groupId = crypto.randomUUID();
      const prevGroupIds: Record<string, string | undefined> = {};
      for (const id of ids) {
        const shape = shapes[id];
        if (shape) prevGroupIds[id] = shape.groupId;
      }
      const cmd: Command = {
        label: 'Group shapes',
        do: (s) => {
          const n = { ...s };
          for (const id of ids) {
            const shape = n[id];
            if (shape) n[id] = { ...shape, groupId };
          }
          return n;
        },
        undo: (s) => {
          const n = { ...s };
          for (const id of ids) {
            const shape = n[id];
            if (shape) n[id] = { ...shape, groupId: prevGroupIds[id] };
          }
          return n;
        },
      };
      const result = executeCommand(history, shapes, cmd);
      set({ shapes: result.shapes, history: result.history });
    },

    ungroupShapes: (ids) => {
      const { shapes, history } = get();
      const prevGroupIds: Record<string, string | undefined> = {};
      for (const id of ids) {
        const shape = shapes[id];
        if (shape) prevGroupIds[id] = shape.groupId;
      }
      const cmd: Command = {
        label: 'Ungroup shapes',
        do: (s) => {
          const n = { ...s };
          for (const id of ids) {
            const shape = n[id];
            if (shape) n[id] = { ...shape, groupId: undefined };
          }
          return n;
        },
        undo: (s) => {
          const n = { ...s };
          for (const id of ids) {
            const shape = n[id];
            if (shape) n[id] = { ...shape, groupId: prevGroupIds[id] };
          }
          return n;
        },
      };
      const result = executeCommand(history, shapes, cmd);
      set({ shapes: result.shapes, history: result.history });
    },

    setCamera: (camera) => set({ camera }),
    setActiveTool: (tool) => set({ activeTool: tool }),
    setPlacementNodeType: (nodeType) => set({ placementNodeType: nodeType }),
    setLens: (lens) => {
      if (lensSwitchTimer) clearTimeout(lensSwitchTimer);
      set({ lens, isLensSwitching: true });
      lensSwitchTimer = setTimeout(() => {
        set({ isLensSwitching: false });
        lensSwitchTimer = null;
      }, LENS_SWITCH_MS);
    },

    select: (ids, mode = 'replace') => {
      const { selectedIds } = get();
      if (mode === 'replace') {
        set({ selectedIds: new Set(ids) });
      } else if (mode === 'add') {
        set({ selectedIds: new Set([...selectedIds, ...ids]) });
      } else {
        const next = new Set(selectedIds);
        for (const id of ids) {
          if (next.has(id)) next.delete(id);
          else next.add(id);
        }
        set({ selectedIds: next });
      }
    },

    clearSelection: () => set({ selectedIds: new Set<ShapeId>() }),

    setHovered: (id) => set({ hoveredId: id }),
    setEditing: (id) => set({ editingId: id }),
    setMarquee: (marquee) => set({ marquee }),
    setIsDragging: (v) => set({ isDragging: v }),
    setIsResizing: (v) => set({ isResizing: v }),

    setFocus: (ids) => set({ focusIds: ids ? new Set(ids) : null }),

    highlight: (ids, durationMs = 5000) => {
      set({ highlightIds: new Set([...get().highlightIds, ...ids]) });
      const timer = setTimeout(() => {
        effectTimers.delete(timer);
        const next = new Set(get().highlightIds);
        for (const id of ids) next.delete(id);
        set({ highlightIds: next });
      }, durationMs);
      effectTimers.add(timer);
    },

    markRecent: (ids, durationMs = 1200) => {
      set({ recentIds: new Set([...get().recentIds, ...ids]) });
      const timer = setTimeout(() => {
        effectTimers.delete(timer);
        const next = new Set(get().recentIds);
        for (const id of ids) next.delete(id);
        set({ recentIds: next });
      }, durationMs);
      effectTimers.add(timer);
    },

    setHiddenKinds: (kinds) => set({ hiddenKinds: new Set(kinds) }),

    setViewportIntent: (intent) => set({ viewportIntent: intent }),

    undo: () => {
      const { history, shapes } = get();
      const result = undoCommand(history, shapes);
      set({ shapes: result.shapes, history: result.history });
    },

    redo: () => {
      const { history, shapes } = get();
      const result = redoCommand(history, shapes);
      set({ shapes: result.shapes, history: result.history });
    },

    _setShapesRaw: (shapes) => set({ shapes }),

    _executeCommand: (cmd) => {
      const { history, shapes } = get();
      const result = executeCommand(history, shapes, cmd);
      set({ shapes: result.shapes, history: result.history });
    },

    loadSnapshot: (snap) => {
      set({
        camera: snap.camera,
        shapes: snap.shapes as unknown as Record<ShapeId, Shape>,
        history: createHistory(),
        selectedIds: new Set<ShapeId>(),
        editingId: null,
        marquee: null,
      });
    },

    exportSnapshot: (): CanvasSnapshot => {
      const { camera, shapes } = get();
      // Ephemeral shapes (host projections of a remote model) are never
      // persisted, or they'd leak into the whiteboard snapshot and
      // resurface on other layers after a reload.
      const persistable: Record<string, unknown> = {};
      for (const [id, shape] of Object.entries(shapes)) {
        if (shape.meta?.ephemeral) continue;
        persistable[id] = shape;
      }
      return { version: 1, camera, shapes: persistable };
    },
  }));

  let unsubscribePersistence: (() => void) | null = null;
  if (options.persistenceKey !== undefined) {
    const key = options.persistenceKey;
    unsubscribePersistence = store.subscribe((state) => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saveTimer = null;
        try {
          localStorage.setItem(key, JSON.stringify(state.exportSnapshot()));
        } catch {
          // ignore storage errors — persistence is best-effort
        }
      }, SAVE_DEBOUNCE_MS);
    });
  }

  const dispose = (): void => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (lensSwitchTimer) {
      clearTimeout(lensSwitchTimer);
      lensSwitchTimer = null;
    }
    for (const timer of effectTimers) clearTimeout(timer);
    effectTimers.clear();
    unsubscribePersistence?.();
    unsubscribePersistence = null;
  };

  // Augment the vanilla store with the instance-scoped registries. The
  // cast is safe: `host` is attached immediately below as an accessor over
  // `hostRef` (a plain property would desync from the ref the actions
  // close over).
  const instance = Object.assign(store, {
    tools: createToolRegistry(),
    shapeUtils: createShapeUtilRegistry(),
    hover: createHoverStore(),
    kindResolver: options.kindResolver ?? defaultKindResolver,
    dispose,
  }) as CanvasStoreInstance;
  Object.defineProperty(instance, 'host', {
    get: () => hostRef.current,
    set: (host: CanvasHost) => {
      hostRef.current = host;
    },
    enumerable: true,
  });

  // A fresh instance is interactive out of the box: the select tool (the
  // default `activeTool`) ships in S1 as the strictness pilot; the rest of
  // the toolset registers here in S2.
  instance.tools.register(createSelectTool(instance));

  return instance;
}
