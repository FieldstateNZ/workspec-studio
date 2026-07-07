/** An axis-aligned node footprint, top-left page coords — the shape every placement decision operates on. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
