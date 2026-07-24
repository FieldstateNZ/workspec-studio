// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { glob } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

// Every colour in this package comes from @workspec/design tokens
// (`var(--*)`) — unlike `@workspec/c4-ui`'s Enterprise kind/category
// conformance data, `kind-meta.ts`'s per-kind accent map holds TOKEN NAMES
// (`--type-persona`, `--el-class`, …), never colour literals, so this
// package needs no documented value exception. Mirrors
// packages/c4-ui/src/zero-local-tokens.test.ts.

const here = fileURLToPath(new URL('.', import.meta.url));

const HEX_COLOR = /#[0-9a-fA-F]{3,8}\b/;
const COLOR_FUNCTION = /\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\(/;
const TAILWIND_ARBITRARY_COLOR = /-\[(?:#|(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\(|color:)/;

describe('zero local design tokens (grep-clean, no documented exceptions)', () => {
  it('no source file contains a raw colour literal', async () => {
    const offenders: string[] = [];

    for await (const path of glob('**/*.{ts,tsx,css}', { cwd: here })) {
      if (path.endsWith('.test.ts') || path.endsWith('.test.tsx')) continue;
      const text = readFileSync(`${here}${path}`, 'utf8');
      if (HEX_COLOR.test(text) || COLOR_FUNCTION.test(text) || TAILWIND_ARBITRARY_COLOR.test(text)) {
        offenders.push(path);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('sanity check: the greps actually detect what they claim to', () => {
    expect(HEX_COLOR.test('const c = "#4A90D9";')).toBe(true);
    expect(COLOR_FUNCTION.test('const c = "hsl(214 88% 51%)";')).toBe(true);
    expect(COLOR_FUNCTION.test('const c = "rgba(0, 0, 0, 0.5)";')).toBe(true);
    expect(TAILWIND_ARBITRARY_COLOR.test('className="text-[#ff0000]"')).toBe(true);
    // The sanctioned patterns stay clean:
    expect(HEX_COLOR.test('const c = "var(--accent)";')).toBe(false);
    expect(COLOR_FUNCTION.test('background: color-mix(in oklab, var(--a) 9%, var(--b));')).toBe(
      false,
    );
  });
});
