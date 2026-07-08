import { describe, expect, it } from 'vitest';
import {
  TOOLTIP_LEFT_MAX,
  TOOLTIP_LEFT_MIN,
  TOOLTIP_TOP_MAX,
  TOOLTIP_TOP_MIN,
  clampTooltipPercents,
} from './clamp-tooltip.js';

describe('clampTooltipPercents', () => {
  it('passes an in-band position through unchanged', () => {
    expect(clampTooltipPercents(40, 50)).toEqual({ left: 40, top: 50 });
  });

  it('clamps a right/bottom-edge anchor into the band', () => {
    expect(clampTooltipPercents(97, 99)).toEqual({ left: TOOLTIP_LEFT_MAX, top: TOOLTIP_TOP_MAX });
  });

  it('clamps a left/top overflow (a panned-away anchor) into the band', () => {
    expect(clampTooltipPercents(-20, -5)).toEqual({ left: TOOLTIP_LEFT_MIN, top: TOOLTIP_TOP_MIN });
  });
});
