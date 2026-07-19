// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { glob } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

// Every colour in this package comes from `@workspec/design` tokens
// (`var(--*)`) — zero local token definitions (T5 brief acceptance
// criterion). This greps every source file (TS, TSX, CSS) for raw colour
// literals: hex, colour-function calls (rgb/rgba/hsl/hsla/oklch/oklab/lab/
// lch/color), and Tailwind arbitrary colour values. Mirrors
// packages/c4-ui/src/zero-local-tokens.test.ts.
//
// `color-mix(` deliberately does NOT match the `color(` pattern (the "-"
// breaks the function-name match): styles.css's chip/pill/dot recipes mix
// TOKENS (`color-mix(in oklab, var(--chip-accent) 12%, transparent)`) — a
// derivation over token values, not a new colour value.

const here = fileURLToPath(new URL('.', import.meta.url));

const HEX_COLOR = /#[0-9a-fA-F]{3,8}\b/;
const COLOR_FUNCTION = /\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\(/;
const TAILWIND_ARBITRARY_COLOR = /-\[(?:#|(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\(|color:)/;

describe('zero local design tokens (grep-clean)', () => {
  it('no source file contains a raw colour literal', async () => {
    const offenders: string[] = [];

    for await (const path of glob('**/*.{ts,tsx,css}', { cwd: here })) {
      if (path.endsWith('.test.ts') || path.endsWith('.test.tsx')) continue;
      const text = readFileSync(`${here}${path}`, 'utf8');
      if (
        HEX_COLOR.test(text) ||
        COLOR_FUNCTION.test(text) ||
        TAILWIND_ARBITRARY_COLOR.test(text)
      ) {
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
    expect(TAILWIND_ARBITRARY_COLOR.test('className="text-[#ff0000]"')).toBe(true);
    expect(TAILWIND_ARBITRARY_COLOR.test('className="bg-[rgb(1,2,3)]"')).toBe(true);
    // The sanctioned patterns stay clean:
    expect(HEX_COLOR.test('const c = "var(--accent)";')).toBe(false);
    expect(COLOR_FUNCTION.test('background: color-mix(in oklab, var(--a) 9%, var(--b));')).toBe(
      false,
    );
    expect(TAILWIND_ARBITRARY_COLOR.test('className="w-[300px]"')).toBe(false);
  });
});
