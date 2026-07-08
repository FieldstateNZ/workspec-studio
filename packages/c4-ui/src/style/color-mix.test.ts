import { describe, expect, it } from 'vitest';
import { WHITE, formatHex, formatRgba, mixOklab, parseCssColor } from './color-mix.js';

describe('parseCssColor', () => {
  it('parses 6-digit hex', () => {
    expect(parseCssColor('#4A90D9')).toEqual({ r: 0x4a / 255, g: 0x90 / 255, b: 0xd9 / 255 });
  });

  it('parses 3-digit hex', () => {
    expect(parseCssColor('#fff')).toEqual(WHITE);
  });

  it('parses the Enterprise spec-defaults hsl() form (space syntax)', () => {
    const parsed = parseCssColor('hsl(0 0% 100%)');
    expect(parsed).not.toBeNull();
    expect(parsed?.r).toBeCloseTo(1);
    expect(parsed?.g).toBeCloseTo(1);
    expect(parsed?.b).toBeCloseTo(1);
  });

  it('parses comma-syntax hsl() too', () => {
    const spaced = parseCssColor('hsl(214 88% 51%)');
    const comma = parseCssColor('hsl(214, 88%, 51%)');
    expect(spaced).toEqual(comma);
  });

  it('resolves var(--token) against a token map, recursively', () => {
    const tokens = { '--ink-fade': '#62626a', '--alias': 'var(--ink-fade)' };
    expect(parseCssColor('var(--ink-fade)', tokens)).toEqual(parseCssColor('#62626a'));
    expect(parseCssColor('var(--alias)', tokens)).toEqual(parseCssColor('#62626a'));
  });

  it('returns null for unsupported forms (the flat-surface fallback path)', () => {
    expect(parseCssColor('rebeccapurple')).toBeNull();
    expect(parseCssColor('var(--missing)', {})).toBeNull();
    expect(parseCssColor('color-mix(in oklab, red, blue)')).toBeNull();
  });
});

describe('mixOklab', () => {
  it('weight 1 returns the first colour, weight 0 the second', () => {
    const a = parseCssColor('#4A90D9');
    const b = parseCssColor('#1c1c22');
    if (!a || !b) throw new Error('unreachable');
    expect(formatHex(mixOklab(a, b, 1))).toBe('#4a90d9');
    expect(formatHex(mixOklab(a, b, 0))).toBe('#1c1c22');
  });

  it('mixing toward white lightens every channel (the dark-theme accent lift)', () => {
    const accent = parseCssColor('#1168BD');
    if (!accent) throw new Error('unreachable');
    const lifted = mixOklab(accent, WHITE, 0.78);
    expect(lifted.r).toBeGreaterThan(accent.r);
    expect(lifted.g).toBeGreaterThan(accent.g);
    expect(lifted.b).toBeGreaterThan(accent.b);
  });

  it('is deterministic', () => {
    const a = parseCssColor('#4A90D9');
    const b = parseCssColor('#ffffff');
    if (!a || !b) throw new Error('unreachable');
    expect(formatHex(mixOklab(a, b, 0.09))).toBe(formatHex(mixOklab(a, b, 0.09)));
  });
});

describe('formatting', () => {
  it('formatHex round-trips a parse', () => {
    const parsed = parseCssColor('#4a90d9');
    if (!parsed) throw new Error('unreachable');
    expect(formatHex(parsed)).toBe('#4a90d9');
  });

  it('formatRgba emits 0..255 channels with the given alpha', () => {
    expect(formatRgba(WHITE, 0.28)).toBe('rgba(255, 255, 255, 0.28)');
  });
});
