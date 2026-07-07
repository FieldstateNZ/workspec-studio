// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { glob } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

// Every colour in this package comes from @workspec/design tokens
// (`var(--*)`) EXCEPT the kind→accent/shape/variant and category→accent/
// style mapping, which is Enterprise conformance DATA (see
// style/spec-defaults.ts's file header) and is the one documented exception
// for colour VALUES. This test greps every other source file (TS, TSX, and
// CSS) for raw colour literals: hex, colour-function calls (rgb/rgba/hsl/
// hsla/oklch/oklab/lab/lch/color), and Tailwind arbitrary colour values.
//
// `color-mix(` deliberately does NOT match the `color(` pattern (the "-"
// breaks the function-name match): styles.css's `.c4-node` layer mixes
// TOKENS (`color-mix(in oklab, var(--c4-el-accent) 9%, var(--bg-elevated))`)
// — a derivation over token values, not a new colour value, mirroring
// Enterprise's own `.c4-el` CSS layer.
//
// style/color-mix.ts gets a narrower exemption: it PARSES colour syntax (the
// in-code color-mix equivalent render-svg.ts needs, since a standalone SVG
// can't use CSS color-mix), so colour-function name tokens appear in its
// parsing logic — but it must still be free of hex literals and Tailwind
// arbitrary values (a hex in the parser would be a smuggled palette value).

const here = fileURLToPath(new URL('.', import.meta.url));
const VALUE_EXEMPT = 'style/spec-defaults.ts';
const SYNTAX_EXEMPT = 'style/color-mix.ts';

const HEX_COLOR = /#[0-9a-fA-F]{3,8}\b/;
const COLOR_FUNCTION = /\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\(/;
const TAILWIND_ARBITRARY_COLOR = /-\[(?:#|(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\(|color:)/;

describe('zero local design tokens (grep-clean except the documented exceptions)', () => {
  it('no source file outside the exceptions contains a raw colour literal', async () => {
    const offenders: string[] = [];

    for await (const path of glob('**/*.{ts,tsx,css}', { cwd: here })) {
      if (path === VALUE_EXEMPT) continue;
      if (path.endsWith('.test.ts') || path.endsWith('.test.tsx')) continue;
      const text = readFileSync(`${here}${path}`, 'utf8');
      const hasColorFunction = path === SYNTAX_EXEMPT ? false : COLOR_FUNCTION.test(text);
      if (HEX_COLOR.test(text) || hasColorFunction || TAILWIND_ARBITRARY_COLOR.test(text)) {
        offenders.push(path);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('sanity check: the greps actually detect what they claim to (guards against silently broken patterns)', () => {
    expect(HEX_COLOR.test('const c = "#4A90D9";')).toBe(true);
    expect(COLOR_FUNCTION.test('const c = "hsl(214 88% 51%)";')).toBe(true);
    expect(COLOR_FUNCTION.test('const c = "rgba(0, 0, 0, 0.5)";')).toBe(true);
    expect(COLOR_FUNCTION.test('const c = "oklch(0.7 0.1 240)";')).toBe(true);
    expect(COLOR_FUNCTION.test('const c = "lch(52% 58 240)";')).toBe(true);
    expect(COLOR_FUNCTION.test('const c = "color(display-p3 1 0 0)";')).toBe(true);
    expect(TAILWIND_ARBITRARY_COLOR.test('className="text-[#ff0000]"')).toBe(true);
    expect(TAILWIND_ARBITRARY_COLOR.test('className="border-[color:red]"')).toBe(true);
    expect(TAILWIND_ARBITRARY_COLOR.test('className="bg-[rgb(1,2,3)]"')).toBe(true);
    // The sanctioned patterns stay clean:
    expect(HEX_COLOR.test('const c = "var(--accent)";')).toBe(false);
    expect(COLOR_FUNCTION.test('background: color-mix(in oklab, var(--a) 9%, var(--b));')).toBe(false);
    expect(TAILWIND_ARBITRARY_COLOR.test('className="w-[300px]"')).toBe(false);
  });
});
