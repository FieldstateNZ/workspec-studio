// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { elementTintsFor } from './element-tints.js';
import { THEMES } from '../themes.js';

// styles.css derives .c4-node's surface/border/eyebrow/ink-dim straight from
// @workspec/design's --el-tint-* tokens — there's nothing to keep in sync
// there, the browser resolves the tokens itself. What DOES need to stay in
// sync: the token names styles.css references, and elementTintsFor()'s
// numeric read of those same tokens for render-svg.ts's code path (a
// standalone SVG can't use CSS color-mix()).

const stylesCss = readFileSync(fileURLToPath(new URL('../styles.css', import.meta.url)), 'utf8');

function lightBlock(): string {
  const start = stylesCss.indexOf('.c4-node {');
  const end = stylesCss.indexOf('}', start);
  return stylesCss.slice(start, end);
}

function darkBlock(): string {
  const start = stylesCss.indexOf(".c4-root[data-theme='dark'] .c4-node {");
  const end = stylesCss.indexOf('}', start);
  return stylesCss.slice(start, end);
}

describe('styles.css .c4-node derivation references the shared @workspec/design tokens', () => {
  it('surface, eyebrow, ink-dim, and border read --el-tint-* (already theme-scoped by the token)', () => {
    const css = lightBlock();
    expect(css).toContain(
      'color-mix(in oklab, var(--c4-el-accent) var(--el-tint-surface), var(--bg-elevated))',
    );
    expect(css).toContain(
      'color-mix(in oklab, var(--c4-el-accent) var(--el-tint-eyebrow), var(--ink))',
    );
    expect(css).toContain('color-mix(in oklab, var(--ink) var(--el-tint-ink-dim), transparent)');
    expect(css).toContain(
      'color-mix(in oklab, var(--c4-el-accent) var(--el-tint-border), transparent)',
    );
    expect(css).toContain('--c4-el-accent: var(--c4-el-accent-raw)');
  });

  it('dark theme overrides only the accent lift — surface/border/eyebrow/ink-dim adapt via the token itself, not a second rule', () => {
    const css = darkBlock();
    expect(css).toContain('color-mix(in oklab, var(--c4-el-accent-raw), white 22%)');
    expect(css).not.toContain('--c4-el-surface');
    expect(css).not.toContain('--c4-el-border');
    expect(css).not.toContain('--c4-el-eyebrow');
    expect(css).not.toContain('--c4-el-ink-dim');
  });

  it('elementTintsFor reads the same @workspec/design tokens render-svg.ts needs, per theme', () => {
    expect(elementTintsFor('light', THEMES.light)).toEqual({
      surfacePct: 9,
      borderPct: 28,
      eyebrowPct: 70,
      inkDimPct: 60,
      accentLiftPct: 0,
    });
    expect(elementTintsFor('dark', THEMES.dark)).toEqual({
      surfacePct: 14,
      borderPct: 34,
      eyebrowPct: 100,
      inkDimPct: 62,
      accentLiftPct: 22,
    });
  });
});
