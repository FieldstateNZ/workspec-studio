// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The canvas-c4 token audit — mirrors packages/canvas/src/token-audit.test.ts:
// every `var(--x)` read must resolve from @workspec/design themes, this
// package's own CSS, or the dynamic list; no raw colour literals outside
// the three documented exemption files (each file's header carries the
// rationale).

const require = createRequire(import.meta.url);
const SRC = join(process.cwd(), 'src');

// Set at runtime via inline style: --el-accent-raw per node (C4NodeComponent
// / ShapeFrame), read back by the .c4-el derivation in index.css.
const DYNAMIC_TOKENS = new Set(['--el-accent-raw']);

const VALUE_EXEMPT = new Set([
  'style/spec-defaults.ts',
  'style/status-colors.ts',
  'style/local-tokens.css',
]);

const HEX_COLOR = /#[0-9a-fA-F]{3,8}\b/;
const COLOR_FUNCTION = /\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\(/;
const TAILWIND_ARBITRARY_COLOR = /-\[(?:#|(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\(|color:)/;

function sourceFiles(): string[] {
  return readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((rel) => /\.(ts|tsx|css)$/.test(rel))
    .filter((rel) => !/\.test\.(ts|tsx)$/.test(rel))
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
 * Strip comments before grepping (issue refs like `#119` are hex-shaped).
 * Line-comment stripping is QUOTE-AWARE (S4 fix round): a naive
 * `indexOf('//')` truncated at `//` inside string literals, letting a
 * colour literal later on the same line escape the grep. Mirrors
 * packages/c4-ui's zero-local-tokens stripper.
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
    for (const rel of sourceFiles()) {
      const text = stripComments(readFileSync(join(SRC, rel), 'utf8'), rel.endsWith('.css'));
      for (const match of text.matchAll(/var\(\s*(--[a-zA-Z0-9-]*)/g)) {
        const name = match[1];
        if (name === undefined || name === '--' || name.endsWith('-')) continue;
        const ok = design.has(name) || packageDefined.has(name) || DYNAMIC_TOKENS.has(name);
        if (!ok) unresolved.push(`${rel}: ${name}`);
      }
    }
    expect([...new Set(unresolved)]).toEqual([]);
  });

  it('sanity: the design package serves the C4 element vocabulary', () => {
    const design = designTokens();
    for (const required of [
      '--el-system',
      '--el-actor',
      '--el-container',
      '--el-database',
      '--el-queue',
      '--el-tint-surface',
      '--el-tint-border',
      '--el-tint-eyebrow',
      '--el-tint-ink-dim',
      '--type-feature',
      '--ink-fade',
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
      if (
        HEX_COLOR.test(text) ||
        COLOR_FUNCTION.test(text) ||
        TAILWIND_ARBITRARY_COLOR.test(text)
      ) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('sanity check: the greps actually detect what they claim to', () => {
    expect(HEX_COLOR.test('const c = "#4A90D9";')).toBe(true);
    expect(COLOR_FUNCTION.test('const c = "hsl(214 88% 51%)";')).toBe(true);
    expect(HEX_COLOR.test('const c = "var(--accent)";')).toBe(false);
    expect(COLOR_FUNCTION.test('background: color-mix(in oklab, var(--a) 9%, var(--b));')).toBe(
      false,
    );
  });
});
