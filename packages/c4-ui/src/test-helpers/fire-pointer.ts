import { fireEvent } from '@testing-library/react';

/**
 * jsdom has no native `PointerEvent` constructor, so
 * `@testing-library/dom`'s `fireEvent.pointerDown`/etc. (which resolve their
 * event constructor via `window.PointerEvent || window.Event`) silently fall
 * back to a plain `Event` — and a plain `Event`'s constructor ignores
 * `clientX`/`clientY` init properties entirely (they're only defined on
 * `MouseEvent`/`PointerEvent`). This dispatches a plain `Event` with
 * `clientX`/`clientY`/`pointerId` set as OWN properties beforehand instead,
 * which React's event system reads off the native event the same way
 * regardless of its real constructor. Shared by `c4-diagram.test.tsx` (node
 * drag/click) and `c4-explorer.test.tsx` (canvas-background click, which
 * clears the detail rail's selection) so the two suites can't drift on this
 * jsdom workaround.
 */
export function firePointer(
  element: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  props: { clientX: number; clientY: number; pointerId?: number; button?: number },
): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  // `button: 0` (left) by default — the canvas engine's pointer pipeline
  // gates on it (right button pans, other buttons are ignored).
  Object.assign(event, { pointerId: 1, button: 0, ...props });
  fireEvent(element, event);
}
