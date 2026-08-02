// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STICKY_COLORS } from './shapes/sticky/sticky-shared.js';

// The S2 token-audit (#118, decision E), two directions + the house grep:
//
// 1. RESOLUTION: every `var(--x)` this package reads must be defined by
//    @workspec/design's themes/tokens, by this package's own CSS, or be on
//    the documented dynamic list below — a missing token silently renders
//    the wrong colour, never an error (risk #2 in the synthesis).
// 2. ZERO LOCAL COLOURS (c4-ui exemption style): no raw colour literals
//    outside the two documented exemption files.

const require = createRequire(import.meta.url);
const SRC = join(process.cwd(), 'src');

// Tokens this package sets at RUNTIME via inline style (never in CSS):
// --conn-accent-raw is written per-edge by ConnectorLayer (spec accent or
// the --c4-conn-default fallback) and read back by the .c4-conn derivation.
const DYNAMIC_TOKENS = new Set(['--conn-accent-raw']);

// Documented VALUE exemptions (each file's header carries the rationale).
const VALUE_EXEMPT = new Set(['style/shape-defaults.ts', 'style/local-tokens.css']);

const HEX_COLOR = /#[0-9a-fA-F]{3,8}\b/;
const COLOR_FUNCTION = /\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\(/;
const TAILWIND_ARBITRARY_COLOR = /-\[(?:#|(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\(|color:)/;
// Named-colour keywords as complete style VALUES (S4 hardening, #120;
// extended to the COMPLETE CSS <named-color> set in S5, #121 — the S4
// list carried ~20 common names, so `steelblue`, `rebeccapurple`,
// `tomato` etc. sailed through). `backgroundColor: 'red'` etc. would sail
// through the function/hex greps. Bare `color:` is deliberately NOT
// scanned in TS — it collides with the StickyColor DATA field
// (`color: 'yellow'` names a paper colour, not a CSS value); the
// unambiguous style properties below cover the real risk. `white` inside
// color-mix( is the ONE sanctioned keyword (the canonical enterprise
// dark-lift literal) — color-mix arguments are stripped before the scan.
//
// The full 148-keyword set from CSS Color Module Level 4 §6.1
// (`transparent`/`currentcolor` are system keywords, not named colours,
// and are token-discipline-neutral — deliberately excluded).
// prettier-ignore
const CSS_NAMED_COLORS = [
  'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black',
  'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse',
  'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue', 'darkcyan',
  'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki', 'darkmagenta',
  'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon', 'darkseagreen',
  'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise', 'darkviolet', 'deeppink',
  'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen',
  'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod', 'gray', 'green', 'greenyellow',
  'grey', 'honeydew', 'hotpink', 'indianred', 'indigo', 'ivory', 'khaki', 'lavender',
  'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral', 'lightcyan',
  'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey', 'lightpink', 'lightsalmon',
  'lightseagreen', 'lightskyblue', 'lightslategray', 'lightslategrey', 'lightsteelblue',
  'lightyellow', 'lime', 'limegreen', 'linen', 'magenta', 'maroon', 'mediumaquamarine',
  'mediumblue', 'mediumorchid', 'mediumpurple', 'mediumseagreen', 'mediumslateblue',
  'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue', 'mintcream',
  'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab', 'orange',
  'orangered', 'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise', 'palevioletred',
  'papayawhip', 'peachpuff', 'peru', 'pink', 'plum', 'powderblue', 'purple', 'rebeccapurple',
  'red', 'rosybrown', 'royalblue', 'saddlebrown', 'salmon', 'sandybrown', 'seagreen', 'seashell',
  'sienna', 'silver', 'skyblue', 'slateblue', 'slategray', 'slategrey', 'snow', 'springgreen',
  'steelblue', 'tan', 'teal', 'thistle', 'tomato', 'turquoise', 'violet', 'wheat', 'white',
  'whitesmoke', 'yellow', 'yellowgreen',
];
// Longest-first so a prefix name (`green`) can never shadow a longer one
// (`greenyellow`) regardless of regex-engine backtracking.
const NAMED_COLOR_KEYWORDS = [...CSS_NAMED_COLORS].sort((a, b) => b.length - a.length).join('|');
// TS style-object values. `background` (the shorthand) joined the property
// set in S5 (#121): `background: 'steelblue'` previously evaded the scan.
const NAMED_COLOR_VALUE = new RegExp(
  `(?:backgroundColor|background|borderColor|outlineColor|stroke|fill)\\s*:\\s*['"](?:${NAMED_COLOR_KEYWORDS})['"]`,
  'i',
);
// CSS declarations get the full property set (no data-field ambiguity).
const NAMED_COLOR_CSS = new RegExp(
  `(?:color|background(?:-color)?|border(?:-color)?|stroke|fill|outline(?:-color)?)\\s*:\\s*(?:${NAMED_COLOR_KEYWORDS})\\s*[;!}]`,
  'i',
);

/** Drop color-mix(...) argument lists so the sanctioned `white 22%` lift never trips the named-colour scan. */
function stripColorMixArgs(text: string): string {
  return text.replace(/color-mix\([^)]*\)/g, 'color-mix()');
}

function sourceFiles(): string[] {
  return readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((rel) => /\.(ts|tsx|css)$/.test(rel))
    .filter((rel) => !/\.test\.(ts|tsx)$/.test(rel))
    .filter((rel) => !rel.startsWith('test-helpers'))
    .filter((rel) => !rel.endsWith('.d.ts'));
}

function cssDefinedTokens(css: string): Set<string> {
  const defined = new Set<string>();
  for (const match of css.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) {
    if (match[1] !== undefined) defined.add(match[1]);
  }
  return defined;
}

function designTokens(): Set<string> {
  // The design package's exports map doesn't expose package.json; resolve a
  // CSS entry it DOES export and walk from there.
  const designRoot = dirname(require.resolve('@workspec/design/tokens.css'));
  const tokens = new Set<string>();
  for (const file of ['tokens.css', 'themes/console-light.css', 'themes/console-dark.css']) {
    for (const t of cssDefinedTokens(readFileSync(join(designRoot, file), 'utf8'))) {
      tokens.add(t);
    }
  }
  return tokens;
}

/**
 * Strip comments before grepping: issue references in prose (`#117`,
 * `#363`) are hex-shaped and would false-positive the colour grep. Colour
 * LITERALS only count in code. Line-comment stripping is QUOTE-AWARE (S4
 * fix round): a naive `indexOf('//')` truncated at `//` inside string
 * literals (`'https://…'`), letting a colour literal later on the same
 * line silently escape the grep. Mirrors packages/c4-ui's
 * zero-local-tokens stripper.
 */
function stripLineComment(line: string): string {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote !== null) {
      if (ch === '\\') {
        i++; // skip the escaped character
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '/' && line[i + 1] === '/') return line.slice(0, i);
  }
  return line;
}

function stripComments(text: string, isCss: boolean): string {
  const noBlock = text.replace(/\/\*[\s\S]*?\*\//g, '');
  if (isCss) return noBlock;
  return noBlock.split('\n').map(stripLineComment).join('\n');
}

describe('token audit — var(--*) resolution', () => {
  it('every token read resolves from @workspec/design, package CSS, or the dynamic list', () => {
    const design = designTokens();
    const packageDefined = new Set<string>();
    for (const rel of sourceFiles()) {
      if (rel.endsWith('.css')) {
        for (const t of cssDefinedTokens(readFileSync(join(SRC, rel), 'utf8'))) {
          packageDefined.add(t);
        }
      }
    }

    const unresolved: string[] = [];
    const dynamicPrefixesSeen: string[] = [];
    for (const rel of sourceFiles()) {
      // Comments may cite token names in prose (e.g. the enterprise
      // `var(--red,…)` this port replaced) — only code reads count.
      const text = stripComments(readFileSync(join(SRC, rel), 'utf8'), rel.endsWith('.css'));
      for (const match of text.matchAll(/var\(\s*(--[a-zA-Z0-9-]*)/g)) {
        const name = match[1];
        if (name === undefined || name === '--') continue;
        if (name.endsWith('-')) {
          // Template-interpolated read (e.g. `var(--sticky-${color}-bg)`) —
          // validated as a prefix against the design tokens below.
          dynamicPrefixesSeen.push(name);
          continue;
        }
        const ok = design.has(name) || packageDefined.has(name) || DYNAMIC_TOKENS.has(name);
        if (!ok) unresolved.push(`${rel}: ${name}`);
      }
    }
    expect([...new Set(unresolved)]).toEqual([]);

    // Every dynamic prefix must match at least one real design token.
    for (const prefix of new Set(dynamicPrefixesSeen)) {
      const matches = [...design].some((t) => t.startsWith(prefix));
      expect(matches, `dynamic token prefix ${prefix} matches no design token`).toBe(true);
    }
  });

  it('interpolated sticky-token reads resolve for EVERY expansion (S4 hardening, #120)', () => {
    // The package's only template-interpolated var() family is
    // `var(--sticky-${color}-{bg|edge|ink})` over the StickyColor union —
    // validate the full cross product, not just the prefix. Both axes are
    // DERIVED from `STICKY_COLORS` (S5, #121 — was a hard-coded 6-list):
    // it is a `Record<StickyColor, {bg; ink; edge}>`, so its keys are
    // exhaustive over the union BY TYPE (adding a StickyColor member
    // without a STICKY_COLORS entry is a compile error in sticky-shared),
    // and this test can never lag a new paper colour.
    const design = designTokens();
    const colors = Object.keys(STICKY_COLORS);
    const parts = [...new Set(Object.values(STICKY_COLORS).flatMap((v) => Object.keys(v)))];
    expect(colors.length).toBeGreaterThanOrEqual(6);
    expect(parts.sort()).toEqual(['bg', 'edge', 'ink']);
    for (const color of colors) {
      for (const part of parts) {
        const token = `--sticky-${color}-${part}`;
        expect(design.has(token), `expansion ${token} missing from design`).toBe(true);
      }
    }
  });

  it('sanity: the design package actually serves the canvas vocabulary', () => {
    const design = designTokens();
    for (const required of [
      '--canvas-bg',
      '--canvas-grid-minor',
      '--canvas-grid-major',
      '--sticky-yellow-bg',
      '--accent',
      '--ink',
      '--line',
    ]) {
      expect(design.has(required), `design token ${required} missing`).toBe(true);
    }
  });
});

describe('zero local design tokens (grep-clean except the documented exemptions)', () => {
  it('no source file outside the exemptions contains a raw colour literal', () => {
    const offenders: string[] = [];
    for (const rel of sourceFiles()) {
      if (VALUE_EXEMPT.has(rel)) continue;
      const text = stripComments(readFileSync(join(SRC, rel), 'utf8'), rel.endsWith('.css'));
      const scanned = stripColorMixArgs(text);
      const namedHit = rel.endsWith('.css')
        ? NAMED_COLOR_CSS.test(scanned)
        : NAMED_COLOR_VALUE.test(scanned);
      if (
        HEX_COLOR.test(scanned) ||
        COLOR_FUNCTION.test(scanned) ||
        TAILWIND_ARBITRARY_COLOR.test(scanned) ||
        namedHit
      ) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('sanity check: the greps actually detect what they claim to', () => {
    expect(HEX_COLOR.test('const c = "#4A90D9";')).toBe(true);
    expect(COLOR_FUNCTION.test('const c = "hsl(214 88% 51%)";')).toBe(true);
    expect(COLOR_FUNCTION.test('const c = "rgba(0, 0, 0, 0.5)";')).toBe(true);
    expect(TAILWIND_ARBITRARY_COLOR.test('className="text-[#ff0000]"')).toBe(true);
    // Named-colour keyword values are caught; sticky DATA fields and the
    // color-mix white lift are not.
    expect(NAMED_COLOR_VALUE.test("stroke: 'red'")).toBe(true);
    expect(NAMED_COLOR_VALUE.test("backgroundColor: 'white'")).toBe(true);
    // Extended named colours + the background shorthand (S5, #121):
    expect(NAMED_COLOR_VALUE.test("background: 'steelblue'")).toBe(true);
    expect(NAMED_COLOR_VALUE.test("fill: 'rebeccapurple'")).toBe(true);
    expect(NAMED_COLOR_CSS.test('  border-color: tomato;')).toBe(true);
    expect(NAMED_COLOR_CSS.test('  background: greenyellow;')).toBe(true); // prefix never shadows
    expect(CSS_NAMED_COLORS).toHaveLength(148); // the complete CSS Color 4 set
    expect(NAMED_COLOR_VALUE.test("color: 'yellow'")).toBe(false);
    expect(NAMED_COLOR_CSS.test('  background: white;')).toBe(true);
    // System keywords stay out of scope:
    expect(NAMED_COLOR_CSS.test('  background: transparent;')).toBe(false);
    expect(NAMED_COLOR_VALUE.test("fill: 'currentColor'")).toBe(false);
    expect(
      NAMED_COLOR_VALUE.test(stripColorMixArgs('color-mix(in oklab, var(--a), white 22%)')),
    ).toBe(false);
    // The sanctioned patterns stay clean:
    expect(HEX_COLOR.test('const c = "var(--accent)";')).toBe(false);
    expect(COLOR_FUNCTION.test('background: color-mix(in oklab, var(--a) 9%, var(--b));')).toBe(
      false,
    );
  });
});
