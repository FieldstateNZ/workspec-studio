// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ELEMENT_TINTS } from './element-tints.js';

// The two renderers derive node colours from the same percentages via two
// mechanisms: the canvas reads literal `color-mix(in oklab, ...)` rules from
// styles.css; render-svg computes them in code from ELEMENT_TINTS. This test
// pins the stylesheet to the constants so the two cannot silently drift.

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

describe('styles.css .c4-node derivation matches ELEMENT_TINTS', () => {
  it('light theme: surface, eyebrow, ink-dim, and border percentages', () => {
    const css = lightBlock();
    const tints = ELEMENT_TINTS.light;
    expect(css).toContain(
      `color-mix(in oklab, var(--c4-el-accent) ${tints.surfacePct}%, var(--bg-elevated))`,
    );
    expect(css).toContain(
      `color-mix(in oklab, var(--c4-el-accent) ${tints.eyebrowPct}%, var(--ink))`,
    );
    expect(css).toContain(`color-mix(in oklab, var(--ink) ${tints.inkDimPct}%, transparent)`);
    expect(css).toContain(
      `color-mix(in oklab, var(--c4-el-accent) ${tints.borderPct}%, transparent)`,
    );
    expect(tints.accentLiftPct).toBe(0);
    expect(css).toContain('--c4-el-accent: var(--c4-el-accent-raw)');
  });

  it('dark theme: accent lift, surface, ink-dim, and border percentages; eyebrow is the lifted accent itself', () => {
    const css = darkBlock();
    const tints = ELEMENT_TINTS.dark;
    expect(css).toContain(
      `color-mix(in oklab, var(--c4-el-accent-raw), white ${tints.accentLiftPct}%)`,
    );
    expect(css).toContain(
      `color-mix(in oklab, var(--c4-el-accent) ${tints.surfacePct}%, var(--bg-elevated))`,
    );
    expect(css).toContain(`color-mix(in oklab, var(--ink) ${tints.inkDimPct}%, transparent)`);
    expect(css).toContain(
      `color-mix(in oklab, var(--c4-el-accent) ${tints.borderPct}%, transparent)`,
    );
    expect(tints.eyebrowPct).toBe(100);
    expect(css).toContain('--c4-el-eyebrow: var(--c4-el-accent)');
  });
});
