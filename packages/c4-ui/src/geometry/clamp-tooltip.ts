// Viewport clamping for the hover tooltip (the c4-core rendering doctrine:
// "positioned near cursor and clamped to viewport"). The tooltip is
// percentage-positioned inside the diagram container and transformed to sit
// above-left of its anchor, so an unclamped anchor at the canvas's right or
// bottom edge would push it outside the container. Bounds are in container
// percent: the left ceiling reserves room for the tooltip's max-width
// (260px against typical diagram widths), the top floor for its own height
// (the translate(-100%) puts it above the anchor).

export interface TooltipPercents {
  readonly left: number;
  readonly top: number;
}

export const TOOLTIP_LEFT_MIN = 2;
export const TOOLTIP_LEFT_MAX = 78;
export const TOOLTIP_TOP_MIN = 12;
export const TOOLTIP_TOP_MAX = 96;

/** Clamps a tooltip anchor's raw container-percent position into the visible band. */
export function clampTooltipPercents(left: number, top: number): TooltipPercents {
  return {
    left: Math.min(TOOLTIP_LEFT_MAX, Math.max(TOOLTIP_LEFT_MIN, left)),
    top: Math.min(TOOLTIP_TOP_MAX, Math.max(TOOLTIP_TOP_MIN, top)),
  };
}
