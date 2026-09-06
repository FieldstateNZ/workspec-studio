import { useEffect, useRef, useCallback, type RefObject } from 'react';
import { useCanvasInstance } from '../canvas-provider.js';
import type { CanvasPointerEvent, Tool } from '../tools/tool-base.js';
import type { Camera, ToolName } from '../types.js';
import type { ShortcutScope } from './use-keyboard-shortcuts.js';
import { screenToPage } from '../utils/transforms.js';
import { hitTestTopmost } from '../utils/hit-test.js';

function buildPointerEvent(
  e: PointerEvent,
  containerRect: DOMRect,
  camera: Camera,
): CanvasPointerEvent {
  const screenX = e.clientX - containerRect.left;
  const screenY = e.clientY - containerRect.top;
  const page = screenToPage({ x: screenX, y: screenY }, camera);
  return {
    pageX: page.x,
    pageY: page.y,
    screenX,
    screenY,
    buttons: e.buttons,
    shiftKey: e.shiftKey,
    metaKey: e.metaKey,
    ctrlKey: e.ctrlKey,
    pointerId: e.pointerId,
    originalEvent: e,
  };
}

/** Options for {@link usePointerEvents}. */
export interface PointerEventOpts {
  /** Open the context menu at screen coords — fired on a right-click that did
   *  NOT turn into a pan drag. */
  onContextMenu?: (clientX: number, clientY: number) => void;
  /**
   * Where the space-hold-to-pan key listener binds; mirrors
   * `useKeyboardShortcuts`'s {@link ShortcutScope} ('window' default —
   * enterprise parity; 'root' = only while focus is inside the canvas;
   * 'none' = off).
   */
  keyboardScope?: ShortcutScope;
}

const PAN_THRESHOLD = 4;

/**
 * How far a left/middle gesture must travel (screen px) before the canvas
 * root takes pointer capture.
 *
 * Capture is what keeps a DRAG alive when the cursor leaves the canvas, so
 * the root must hold it for the whole of one — but taking it on
 * `pointerdown` (as enterprise's `usePointerEvents` does) makes the browser
 * retarget that gesture's compatibility mouse events (`mouseup`, `click`,
 * `dblclick`) to the capturing element. Verified in Chrome against the
 * served studio: with capture on pointerdown a double-click on a C4 card
 * arrives as `dblclick` on the canvas ROOT, so the card's own React
 * `onDoubleClick` — the only route to the element editor — never fires;
 * with capture deferred, the same gesture lands on the card and the editor
 * opens (A3, #133).
 *
 * Deferring costs nothing: below the threshold no tool treats the gesture
 * as a drag (`PAN_THRESHOLD` here, `DRAG_THRESHOLD` in the C4 facade tool
 * and the select tool), and the first move past it is dispatched while the
 * cursor is still over the root, so a real drag captures before it can
 * escape. Only a click keeps its DOM semantics — which is the fix.
 */
const CAPTURE_THRESHOLD = PAN_THRESHOLD;

/**
 * Wires the canvas root element's pointer/keyboard gestures to the
 * instance's tool registry: left/middle button events dispatch to the
 * active tool (double-click detected at 300ms/5px), right-button drag
 * pans the camera (a plain right-click opens the context menu instead),
 * pointer moves feed the hover store, and holding Space temporarily
 * switches to the hand tool. Ported from the enterprise
 * `usePointerEvents`; the static TOOLS map became the instance registry
 * (issue #117), falling back to the select tool for unregistered names —
 * the enterprise fallback semantics.
 */
export function usePointerEvents(
  containerRef: RefObject<HTMLDivElement | null>,
  opts: PointerEventOpts = {},
): void {
  const instance = useCanvasInstance();
  const spaceHeldRef = useRef(false);
  const prevToolRef = useRef<ToolName | null>(null);
  const lastClickRef = useRef<{ x: number; y: number; time: number } | null>(null);
  // Tracks whether the current pointer gesture just entered edit mode. When true,
  // the immediately-following mousedown should preventDefault so the browser doesn't
  // move focus to body (which would blur the freshly-mounted contentEditable).
  // Cleared after one mousedown so subsequent clicks-away exit editing normally.
  const justEnteredEditingRef = useRef(false);
  // A left/middle gesture that has not yet earned pointer capture — see
  // `CAPTURE_THRESHOLD` and `handlePointerMove`.
  const pendingCaptureRef = useRef<{ id: number; x: number; y: number } | null>(null);
  // Right-button drag = pan. Tracks the gesture; `moved` distinguishes a pan
  // (suppress the menu) from a plain right-click (open the menu on pointerup).
  const panRef = useRef<{
    sx: number;
    sy: number;
    camX: number;
    camY: number;
    moved: boolean;
  } | null>(null);
  const onContextMenuRef = useRef(opts.onContextMenu);
  onContextMenuRef.current = opts.onContextMenu;

  const getActiveTool = useCallback((): Tool | undefined => {
    const toolName = instance.getState().activeTool;
    return instance.tools.get(toolName) ?? instance.tools.get('select');
  }, [instance]);

  // Fire a tool's onExit/onEnter lifecycle on every tool change, so a tool can
  // tear down transient state it owns (e.g. a link tool clearing its source
  // highlight when you switch away mid-link).
  useEffect(() => {
    let prev = instance.getState().activeTool;
    const unsubscribe = instance.subscribe((state) => {
      const next = state.activeTool;
      if (next === prev) return;
      const fallback = instance.tools.get('select');
      (instance.tools.get(prev) ?? fallback)?.onExit?.(state);
      (instance.tools.get(next) ?? fallback)?.onEnter?.(state);
      prev = next;
    });
    return unsubscribe;
  }, [instance]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handlePointerDown = (e: PointerEvent): void => {
      // Don't capture pointer events that originated from canvas UI (toolbar, panels).
      if ((e.target as Element | null)?.closest('[data-canvas-ui]')) return;

      // Right button → pan drag (or context menu if it's a click, not a drag).
      if (e.button === 2) {
        (e.currentTarget as Element | null)?.setPointerCapture(e.pointerId);
        const cam = instance.getState().camera;
        panRef.current = { sx: e.clientX, sy: e.clientY, camX: cam.x, camY: cam.y, moved: false };
        return;
      }

      if (e.button !== 0 && e.button !== 1) return;
      // Capture is ARMED here and taken on the first move past
      // `CAPTURE_THRESHOLD` — see that constant for why taking it now would
      // break every shape's own DOM click/double-click handler.
      pendingCaptureRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };

      const rect = el.getBoundingClientRect();
      const store = instance.getState();
      const ev = buildPointerEvent(e, rect, store.camera);
      const editingBefore = store.editingId;

      const now = Date.now();
      const last = lastClickRef.current;
      const isDoubleClick =
        last !== null &&
        now - last.time < 300 &&
        Math.hypot(ev.screenX - last.x, ev.screenY - last.y) < 5;

      lastClickRef.current = { x: ev.screenX, y: ev.screenY, time: now };

      if (isDoubleClick) {
        getActiveTool()?.onDoubleClick?.(ev, store);
      } else {
        getActiveTool()?.onPointerDown?.(ev, store);
      }

      // If this gesture just entered edit mode, guard the following mousedown.
      // Zustand set() is synchronous so getState() already reflects the new value.
      if (!editingBefore && instance.getState().editingId) {
        justEnteredEditingRef.current = true;
      }
    };

    const handlePointerMove = (e: PointerEvent): void => {
      // Take the capture the pointerdown armed, once this gesture is a drag
      // rather than a click (see `CAPTURE_THRESHOLD`).
      const pending = pendingCaptureRef.current;
      if (
        pending !== null &&
        Math.hypot(e.clientX - pending.x, e.clientY - pending.y) > CAPTURE_THRESHOLD
      ) {
        pendingCaptureRef.current = null;
        el.setPointerCapture(pending.id);
      }

      // Right-button pan — adjust the camera by the screen-space drag delta.
      if (panRef.current) {
        const dx = e.clientX - panRef.current.sx;
        const dy = e.clientY - panRef.current.sy;
        if (!panRef.current.moved && Math.hypot(dx, dy) > PAN_THRESHOLD) {
          panRef.current.moved = true;
        }
        if (panRef.current.moved) {
          const { zoom } = instance.getState().camera;
          instance.getState().setCamera({
            x: panRef.current.camX - dx / zoom,
            y: panRef.current.camY - dy / zoom,
            zoom,
          });
        }
        return;
      }

      const rect = el.getBoundingClientRect();
      const store = instance.getState();

      // Hover tracking — drives connector/node highlighting. Skip during an
      // active gesture (drag/resize/marquee) so the highlight doesn't flicker.
      if (!store.isDragging && !store.isResizing && !store.marquee) {
        const page = screenToPage(
          { x: e.clientX - rect.left, y: e.clientY - rect.top },
          store.camera,
        );
        instance.hover
          .getState()
          .setHovered(
            hitTestTopmost(page.x, page.y, store.shapes, store.lens, (type) =>
              instance.shapeUtils.get(type),
            ),
          );
      }

      const ev = buildPointerEvent(e, rect, store.camera);
      getActiveTool()?.onPointerMove?.(ev, store);
    };

    const handlePointerUp = (e: PointerEvent): void => {
      pendingCaptureRef.current = null;
      // End a right-button gesture: a plain click (no drag) opens the context
      // menu; a pan drag just ends.
      if (panRef.current) {
        const moved = panRef.current.moved;
        panRef.current = null;
        if (!moved) onContextMenuRef.current?.(e.clientX, e.clientY);
        return;
      }
      if ((e.target as Element | null)?.closest('[data-canvas-ui]')) return;
      const rect = el.getBoundingClientRect();
      const store = instance.getState();
      const ev = buildPointerEvent(e, rect, store.camera);
      getActiveTool()?.onPointerUp?.(ev, store);
    };

    const handlePointerCancel = (): void => {
      pendingCaptureRef.current = null;
      panRef.current = null;
      const store = instance.getState();
      store.setMarquee(null);
      store.setIsDragging(false);
      store.setIsResizing(false);
    };

    const handlePointerLeave = (): void => {
      instance.hover.getState().setHovered(null);
    };

    const handleTouchStart = (e: TouchEvent): void => {
      e.preventDefault();
    };

    // Between pointerdown and mousedown (separate DOM events), the browser runs a
    // microtask checkpoint. React commits there, so the contentEditable mounts and
    // gets focus via useLayoutEffect — then mousedown on the non-focusable canvas
    // root moves focus to body, blurring the freshly-focused editor.
    // We prevent that ONLY for the mousedown that immediately follows the gesture
    // that entered editing; subsequent mousedowns (click-away) are left alone so
    // the editor blurs and exits editing as expected.
    const handleMouseDown = (e: MouseEvent): void => {
      if (justEnteredEditingRef.current) {
        justEnteredEditingRef.current = false;
        e.preventDefault();
      }
    };

    el.addEventListener('mousedown', handleMouseDown);
    el.addEventListener('pointerdown', handlePointerDown);
    el.addEventListener('pointermove', handlePointerMove);
    el.addEventListener('pointerup', handlePointerUp);
    el.addEventListener('pointercancel', handlePointerCancel);
    el.addEventListener('pointerleave', handlePointerLeave);
    el.addEventListener('touchstart', handleTouchStart, { passive: false });

    return () => {
      el.removeEventListener('mousedown', handleMouseDown);
      el.removeEventListener('pointerdown', handlePointerDown);
      el.removeEventListener('pointermove', handlePointerMove);
      el.removeEventListener('pointerup', handlePointerUp);
      el.removeEventListener('pointercancel', handlePointerCancel);
      el.removeEventListener('pointerleave', handlePointerLeave);
      el.removeEventListener('touchstart', handleTouchStart);
    };
  }, [containerRef, getActiveTool, instance]);

  const keyboardScope = opts.keyboardScope ?? 'window';
  useEffect(() => {
    if (keyboardScope === 'none') return;
    const target: EventTarget | null = keyboardScope === 'root' ? containerRef.current : window;
    if (!target) return;

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.code === 'Space' && !spaceHeldRef.current) {
        const targetEl = e.target as HTMLElement;
        if (
          targetEl.isContentEditable ||
          targetEl.tagName === 'INPUT' ||
          targetEl.tagName === 'TEXTAREA'
        )
          return;
        // Space-pan only when a hand tool is actually registered — the same
        // registration gate every other tool activation goes through (S1
        // debt, #118). An unregistered 'hand' would grab the cursor with
        // select-tool gestures underneath.
        if (!instance.tools.get('hand')) return;
        spaceHeldRef.current = true;
        const store = instance.getState();
        prevToolRef.current = store.activeTool;
        store.setActiveTool('hand');
        e.preventDefault();
      }
    };

    const endSpacePan = (): void => {
      if (!spaceHeldRef.current) return;
      spaceHeldRef.current = false;
      if (prevToolRef.current) {
        instance.getState().setActiveTool(prevToolRef.current);
        prevToolRef.current = null;
      }
    };

    const handleKeyUp = (e: KeyboardEvent): void => {
      if (e.code === 'Space') endSpacePan();
    };

    // Root scope: keyup only delivers while focus is still inside the
    // canvas — if focus leaves mid-hold the hand tool would stick. Clear
    // the space-pan state whenever focus exits the root subtree.
    const rootEl = keyboardScope === 'root' ? containerRef.current : null;
    const handleFocusOut = (e: FocusEvent): void => {
      const next = e.relatedTarget;
      if (rootEl && next instanceof Node && rootEl.contains(next)) return;
      endSpacePan();
    };

    target.addEventListener('keydown', handleKeyDown as EventListener);
    target.addEventListener('keyup', handleKeyUp as EventListener);
    rootEl?.addEventListener('focusout', handleFocusOut);
    return () => {
      target.removeEventListener('keydown', handleKeyDown as EventListener);
      target.removeEventListener('keyup', handleKeyUp as EventListener);
      rootEl?.removeEventListener('focusout', handleFocusOut);
    };
  }, [instance, keyboardScope, containerRef]);
}
