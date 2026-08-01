import {
  useRef,
  useEffect,
  useLayoutEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
  type RefObject,
} from 'react';
import { useCanvasInstance, useCanvasStore } from './canvas-provider.js';
import { usePointerEvents } from './hooks/use-pointer-events.js';
import { useKeyboardShortcuts } from './hooks/use-keyboard-shortcuts.js';
import { useCamera } from './hooks/use-camera.js';
import { CanvasViewportContext, type CanvasViewport } from './canvas-viewport.js';
import { screenToPage } from './utils/transforms.js';
import { hitTestTopmost } from './utils/hit-test.js';
import type { ShapeId } from './types.js';

// Cursor per known tool (unregistered/custom tools fall back to their own
// `cursor` field). Mirrors the enterprise map, including tools this
// package only ships later (S2) or hosts register themselves.
const TOOL_CURSORS: Record<string, string> = {
  select: 'default',
  hand: 'grab',
  sticky: 'crosshair',
  text: 'text',
  draw: 'crosshair',
  connector: 'crosshair',
  flow: 'crosshair',
  place: 'crosshair',
};

/** An open context menu: screen coords + the shape ids it operates on ([] = container level). */
export interface CanvasContextMenuState {
  x: number;
  y: number;
  ids: ShapeId[];
}

/** Props for {@link Canvas}. */
export interface CanvasProps {
  /**
   * The layer stack (shape/connector/selection layers, chrome). S1 ships
   * the engine only — S2's layer components compose here as children,
   * absolutely positioned over the root (which is `position: relative`).
   */
  children?: ReactNode;
  /**
   * Render the context-menu chrome for an open menu (S2 ships a default
   * ContextMenu component; until then hosts supply their own). Omitted =
   * right-click hit-testing still runs but nothing renders.
   */
  renderContextMenu?: (menu: CanvasContextMenuState & { onClose: () => void }) => ReactNode;
}

/**
 * The canvas root: a `position: relative`, overflow-hidden div that owns
 * pointer/keyboard/wheel wiring, the tool cursor, right-click
 * context-menu hit-testing and the measured-viewport seam
 * (`CanvasViewportContext`) every camera-fit/culling consumer reads
 * instead of the window (issue #117). Must be mounted inside
 * `<CanvasProvider>`; the host controls its size (the root fills its
 * container).
 *
 * Structure note: all viewport-consuming wiring (camera, wheel, keyboard,
 * pointer/context-menu) lives in the inner `CanvasWiring` component,
 * which renders BENEATH the `CanvasViewportContext.Provider`. React
 * context only resolves from providers above the consumer — hooks called
 * in this outer component's own body would read the null default and
 * silently lose the measured rect (zoom-to-fit no-ops, wheel zoom
 * anchoring on raw client coordinates).
 */
export function Canvas({ children, renderContextMenu }: CanvasProps = {}): ReactNode {
  const rootRef = useRef<HTMLDivElement>(null);
  const instance = useCanvasInstance();
  const activeTool = useCanvasStore((s) => s.activeTool);
  const isDragging = useCanvasStore((s) => s.isDragging);
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  // Measure the root element and keep the viewport context current — the
  // seam that replaces every window-inner-size read in the enterprise
  // source. ResizeObserver tracks host layout changes; the initial
  // synchronous measure covers environments without it (jsdom).
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = (): void => {
      const rect = el.getBoundingClientRect();
      setViewportSize((prev) =>
        prev.width === rect.width && prev.height === rect.height
          ? prev
          : { width: rect.width, height: rect.height },
      );
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const viewport = useMemo<CanvasViewport>(
    () => ({
      width: viewportSize.width,
      height: viewportSize.height,
      getRect: () => rootRef.current?.getBoundingClientRect() ?? null,
    }),
    [viewportSize],
  );

  const cursor =
    activeTool === 'hand' && isDragging
      ? 'grabbing'
      : (TOOL_CURSORS[activeTool] ?? instance.tools.get(activeTool)?.cursor ?? 'default');

  return (
    <CanvasViewportContext.Provider value={viewport}>
      <div
        ref={rootRef}
        className="wsc-root"
        data-canvas-root
        onContextMenu={(e) => e.preventDefault()}
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          backgroundColor: 'var(--canvas-bg)',
          userSelect: 'none',
          cursor,
        }}
      >
        {children}
        <CanvasWiring rootRef={rootRef} renderContextMenu={renderContextMenu} />
      </div>
    </CanvasViewportContext.Provider>
  );
}

/**
 * Interaction wiring for the canvas root. Rendered inside the viewport
 * provider so `useCamera`/`useKeyboardShortcuts` (and anything else
 * reading `useCanvasViewport`) receive the measured rect instead of the
 * null default. Renders only the open context menu (last in the root's
 * child list so host chrome stacks beneath it).
 */
function CanvasWiring({
  rootRef,
  renderContextMenu,
}: {
  rootRef: RefObject<HTMLDivElement | null>;
  renderContextMenu?: ((menu: CanvasContextMenuState & { onClose: () => void }) => ReactNode) | undefined;
}): ReactNode {
  const instance = useCanvasInstance();
  const { handleWheel } = useCamera();
  const [contextMenu, setContextMenu] = useState<CanvasContextMenuState | null>(null);

  const openContextMenuAt = useCallback(
    (clientX: number, clientY: number) => {
      const el = rootRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const store = instance.getState();
      const pagePos = screenToPage({ x: clientX - rect.left, y: clientY - rect.top }, store.camera);

      const getUtil = (type: string) => instance.shapeUtils.get(type);
      const hitId = hitTestTopmost(pagePos.x, pagePos.y, store.shapes, store.lens, getUtil);

      if (!hitId) {
        // Right-click on empty space INSIDE a context-menu surface (e.g. a
        // C4 container boundary — pointer-through, hitTest returns false)
        // opens a container-level menu. The enterprise hard-coded the
        // 'c4_boundary' shape id here; the ShapeUtil capability
        // `isContextMenuSurface` replaces it (issue #117). Topmost surface
        // wins, matching hit-test ordering.
        const sorted = Object.values(store.shapes).sort((a, b) => b.index.localeCompare(a.index));
        for (const shape of sorted) {
          const util = getUtil(shape.type);
          if (!util?.isContextMenuSurface?.(shape)) continue;
          if (
            pagePos.x >= shape.x &&
            pagePos.x <= shape.x + shape.width &&
            pagePos.y >= shape.y &&
            pagePos.y <= shape.y + shape.height
          ) {
            store.clearSelection();
            setContextMenu({ x: clientX, y: clientY, ids: [] });
            return;
          }
        }
        return;
      }

      let ids: ShapeId[];
      if (store.selectedIds.has(hitId)) {
        ids = [...store.selectedIds];
      } else {
        const hitShape = store.shapes[hitId];
        ids = hitShape?.groupId
          ? Object.values(store.shapes)
              .filter((s) => s.groupId === hitShape.groupId)
              .map((s) => s.id)
          : [hitId];
        store.select(ids, 'replace');
      }

      setContextMenu({ x: clientX, y: clientY, ids });
    },
    [instance, rootRef],
  );

  usePointerEvents(rootRef, { onContextMenu: openContextMenuAt });
  useKeyboardShortcuts();

  // Native (non-passive) wheel listener: React's synthetic wheel handler
  // is passive, and camera zoom must preventDefault browser page zoom.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      handleWheel(e);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [handleWheel, rootRef]);

  return (
    contextMenu && renderContextMenu?.({ ...contextMenu, onClose: () => setContextMenu(null) })
  );
}
