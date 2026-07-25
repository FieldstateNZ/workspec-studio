/**
 * A rectangle in canvas pixel coordinates — the shape both node cards and
 * boundary boxes are laid out in. `x`/`y` is the top-left corner.
 */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A rectangle's centre point. */
export function rectCenter(rect: Rect): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}
