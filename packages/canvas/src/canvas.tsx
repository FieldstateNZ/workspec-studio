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
import { useKeyboardShortcuts, type ShortcutScope } from './hooks/use-keyboard-shortcuts.js';
import { useCamera } from './hooks/use-camera.js';
import { CanvasViewportContext, type CanvasViewport } from './canvas-viewport.js';
import { screenToPage } from './utils/transforms.js';
import { hitTestTopmost } from './utils/hit-test.js';
import { Background, type BackgroundVariant } from './components/background.js';
import { ConnectorLayer } from './shapes/connector/connector-layer.js';
import { ShapeLayer } from './components/shape-layer.js';
import { SelectionLayer } from './components/selection-layer.js';
import { MarqueeBox } from './components/marquee-box.js';
import { CanvasZoomControls } from './components/canvas-zoom-controls.js';
import { Minimap } from './components/minimap.js';
import { ContextMenu } from './components/context-menu.js';
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
   * The layer stack. Omitted = the enterprise default stack (Background
   * when `backgroundVariant` is set, ConnectorLayer, ShapeLayer,
   * SelectionLayer, MarqueeBox, CanvasZoomControls, Minimap when
   * `showMinimap`). Provide children to compose a custom stack instead —
   * children REPLACE the default layers, absolutely positioned over the
   * root (`position: relative`).
   */
  children?: ReactNode;
  /**
   * Render custom context-menu chrome for an open menu. Omitted = the
   * ported default ContextMenu component.
   */
  renderContextMenu?: (menu: CanvasContextMenuState & { onClose: () => void }) => ReactNode;
  /** Grid style for the default Background layer; omitted = no background (enterprise default). */
  backgroundVariant?: BackgroundVariant;
  /** Render the default Minimap (bottom-right). */
  showMinimap?: boolean;
  /** kind → colour map for the default Minimap's shape dots. */
  minimapKindColors?: Record<string, string>;
  /**
   * Keyboard-shortcut binding policy (#118): 'window' (default, enterprise
   * parity — one canvas per page), 'root' (only while focus is inside this
   * canvas — REQUIRED when a page mounts several), or 'none'. 'root' makes
   * the canvas root focusable (tabIndex 0).
   */
  shortcutScope?: ShortcutScope;
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
export function Canvas({
  children,
  renderContextMenu,
  backgroundVariant,
  showMinimap,
  minimapKindColors,
  shortcutScope = 'window',
}: CanvasProps = {}): ReactNode {
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

  // The enterprise Canvas's own layer stack, used when the host doesn't
  // compose one. MarqueeBox self-gates on store.marquee.
  const defaultStack = (
    <>
      {backgroundVariant !== undefined && <Background variant={backgroundVariant} />}
      <ConnectorLayer layer="geometry" />
      <ShapeLayer />
      <ConnectorLayer layer="labels" />
      <SelectionLayer />
      <MarqueeBox />
      <CanvasZoomControls />
      {showMinimap === true && (
        <Minimap {...(minimapKindColors !== undefined ? { kindColors: minimapKindColors } : {})} />
      )}
    </>
  );

  return (
    <CanvasViewportContext.Provider value={viewport}>
      <div
        ref={rootRef}
        className="wsc-root"
        data-canvas-root
        {...(shortcutScope === 'root' ? { tabIndex: 0 } : {})}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          backgroundColor: 'var(--canvas-bg)',
          userSelect: 'none',
          outline: 'none',
          cursor,
        }}
      >
        {children ?? defaultStack}
        <CanvasWiring
          rootRef={rootRef}
          renderContextMenu={renderContextMenu}
          shortcutScope={shortcutScope}
        />
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
  shortcutScope,
}: {
  rootRef: RefObject<HTMLDivElement | null>;
  renderContextMenu?: ((menu: CanvasContextMenuState & { onClose: () => void }) => ReactNode) | undefined;
  shortcutScope: ShortcutScope;
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

  usePointerEvents(rootRef, { onContextMenu: openContextMenuAt, keyboardScope: shortcutScope });
  useKeyboardShortcuts({ scope: shortcutScope, rootRef });

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

  if (!contextMenu) return null;
  const menu = { ...contextMenu, onClose: () => { setContextMenu(null); } };
  // Default to the ported ContextMenu component (enterprise behaviour);
  // hosts override via renderContextMenu.
  return renderContextMenu ? (
    renderContextMenu(menu)
  ) : (
    <ContextMenu x={menu.x} y={menu.y} ids={menu.ids} onClose={menu.onClose} />
  );
}
