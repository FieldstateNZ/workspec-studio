// In-code equivalent of CSS `color-mix(in oklab, ...)`, for `render-svg.ts`:
// a standalone SVG document's attributes cannot use CSS colour functions, so
// the same accent→surface/border/eyebrow derivation the canvas gets from
// `src/styles.css` (see style/element-tints.ts) is computed here to literal
// colour values. Oklab conversion follows Björn Ottosson's reference
// implementation (the same space CSS `color-mix(in oklab, ...)` uses), so
// the computed values agree with the browser's within rounding.
//
// Parses only the colour forms that actually occur in this package's inputs:
// hex (#rgb/#rrggbb/#rrggbbaa), `hsl(H S% L%)` (the Enterprise
// spec-defaults form, comma syntax also accepted), and `var(--token)`
// (resolved against the supplied theme token map). Anything else — an
// exotic authored spec.yaml accent — returns null and the caller falls back
// to flat theme surfaces (documented in docs/c4/drift-log.md).

/** An sRGB colour, each channel 0..1. */
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** Pure white, as mix input for the dark-theme accent lift (numeric on purpose — no colour literals in this file). */
export const WHITE: Rgb = { r: 1, g: 1, b: 1 };

function parseHex(value: string): Rgb | null {
  const hex = value.slice(1);
  if (!/^[0-9a-fA-F]+$/.test(hex)) return null;
  if (hex.length === 3) {
    const [r, g, b] = hex;
    return {
      r: parseInt(`${r}${r}`, 16) / 255,
      g: parseInt(`${g}${g}`, 16) / 255,
      b: parseInt(`${b}${b}`, 16) / 255,
    };
  }
  if (hex.length === 6 || hex.length === 8) {
    return {
      r: parseInt(hex.slice(0, 2), 16) / 255,
      g: parseInt(hex.slice(2, 4), 16) / 255,
      b: parseInt(hex.slice(4, 6), 16) / 255,
    };
  }
  return null;
}

function hueToChannel(p: number, q: number, t: number): number {
  let h = t;
  if (h < 0) h += 1;
  if (h > 1) h -= 1;
  if (h < 1 / 6) return p + (q - p) * 6 * h;
  if (h < 1 / 2) return q;
  if (h < 2 / 3) return p + (q - p) * (2 / 3 - h) * 6;
  return p;
}

function parseHslBody(body: string): Rgb | null {
  const parts = body.split(/[\s,/]+/).filter((part) => part.length > 0);
  if (parts.length < 3) return null;
  const h = Number.parseFloat(parts[0] as string);
  const s = Number.parseFloat((parts[1] as string).replace('%', '')) / 100;
  const l = Number.parseFloat((parts[2] as string).replace('%', '')) / 100;
  if (!Number.isFinite(h) || !Number.isFinite(s) || !Number.isFinite(l)) return null;

  if (s === 0) return { r: l, g: l, b: l };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hn = (((h % 360) + 360) % 360) / 360;
  return {
    r: hueToChannel(p, q, hn + 1 / 3),
    g: hueToChannel(p, q, hn),
    b: hueToChannel(p, q, hn - 1 / 3),
  };
}

/**
 * Parses a CSS colour value into sRGB. `var(--token)` references resolve
 * (recursively) against `tokens`; unsupported forms return null.
 */
export function parseCssColor(
  value: string,
  tokens?: Readonly<Record<string, string>>,
): Rgb | null {
  const trimmed = value.trim();
  if (trimmed.startsWith('#')) return parseHex(trimmed);

  const varMatch = /^var\((--[a-zA-Z0-9-]+)\)$/.exec(trimmed);
  if (varMatch) {
    const resolved = tokens?.[varMatch[1] as string];
    return resolved !== undefined ? parseCssColor(resolved, tokens) : null;
  }

  const functionMatch = /^([a-zA-Z-]+)\((.*)\)$/.exec(trimmed);
  if (functionMatch && (functionMatch[1] === 'hsl' || functionMatch[1] === 'hsla')) {
    return parseHslBody(functionMatch[2] as string);
  }
  return null;
}

// ── Oklab conversion (Ottosson reference implementation) ─────────────────────

interface Oklab {
  readonly L: number;
  readonly a: number;
  readonly b: number;
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.min(1, Math.max(0, v));
}

function rgbToOklab(rgb: Rgb): Oklab {
  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

function oklabToRgb(lab: Oklab): Rgb {
  const l = Math.pow(lab.L + 0.3963377774 * lab.a + 0.2158037573 * lab.b, 3);
  const m = Math.pow(lab.L - 0.1055613458 * lab.a - 0.0638541728 * lab.b, 3);
  const s = Math.pow(lab.L - 0.0894841775 * lab.a - 1.291485548 * lab.b, 3);

  return {
    r: linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  };
}

/**
 * `color-mix(in oklab, a X%, b)` — `weightA` is X/100 (a's share; b gets the
 * rest). Both inputs opaque; for a mix over `transparent`, use
 * {@link formatRgba} with the share as alpha instead (CSS premultiplied
 * interpolation with `transparent` reduces to exactly that).
 */
export function mixOklab(a: Rgb, b: Rgb, weightA: number): Rgb {
  const labA = rgbToOklab(a);
  const labB = rgbToOklab(b);
  const w = Math.min(1, Math.max(0, weightA));
  return oklabToRgb({
    L: labA.L * w + labB.L * (1 - w),
    a: labA.a * w + labB.a * (1 - w),
    b: labA.b * w + labB.b * (1 - w),
  });
}

function channelToHex(c: number): string {
  return Math.round(c * 255)
    .toString(16)
    .padStart(2, '0');
}

/** Formats as `#rrggbb`. */
export function formatHex(rgb: Rgb): string {
  return `#${channelToHex(rgb.r)}${channelToHex(rgb.g)}${channelToHex(rgb.b)}`;
}

/** Formats as `rgba(r, g, b, a)` with 0..255 channels and a 0..1 alpha. */
export function formatRgba(rgb: Rgb, alpha: number): string {
  const to255 = (c: number): number => Math.round(c * 255);
  return `rgba(${to255(rgb.r)}, ${to255(rgb.g)}, ${to255(rgb.b)}, ${alpha})`;
}
