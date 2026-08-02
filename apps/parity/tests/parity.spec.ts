import { expect, test } from '@playwright/test';

// The S4 parity goldens (#120): each scenario × theme gets a committed
// screenshot; a chrome regression (card metrics, edge treatment, boundary,
// background grid, state affordances) fails with a diff artifact. The C4
// facade itself renders no grid (the April enterprise references' dotted
// grid is app-shell chrome, verified against enterprise Canvas.tsx) — the
// `grid` scenario goldens @workspec/canvas's Background layer instead,
// which is the 'grid' surface #120 names. Layout-position deltas vs the
// enterprise references are accepted (elk ≠ dagre) — the comparison
// against enterprise crops lives in the S4 comparison sheet, not in these
// assertions.

const SCENARIOS = [
  'cards',
  'edges',
  'boundary',
  'grid',
  'system-context',
  'container-lens',
] as const;
const THEMES = ['light', 'dark'] as const;

// The grid dots are deliberately low-alpha (--canvas-grid-minor ≈ 3%) AND
// low-area (quarter-circles at each pattern corner — ~1.5k of the frame's
// ~967k CSS pixels), so the default per-pixel colour threshold (0.2)
// swallows every dot and the suite-wide maxDiffPixelRatio (0.001 ≈ 967
// pixels) would swallow their total even if counted. The grid scenario
// pins EXACT pixels with a small absolute allowance instead — calibrated
// so that dropping the Background layer fails (~1.5k differing pixels,
// mutation-verified in the S4 fix round) while identical re-renders (the
// harness is deterministic: one worker, local fonts, animations disabled)
// stay comfortably green. Everything else keeps the defaults.
const PER_SCENARIO_OPTIONS: Record<
  string,
  { threshold?: number; maxDiffPixels?: number }
> = {
  grid: { threshold: 0, maxDiffPixels: 64 },
};

for (const scenario of SCENARIOS) {
  for (const theme of THEMES) {
    test(`${scenario} — ${theme}`, async ({ page }) => {
      await page.goto(`/#${scenario}/${theme}`);
      const frame = page.locator('[data-parity-frame]');
      await expect(frame).toBeVisible();
      // Facade scenes lay out async (elk) — wait for the canvas root.
      await expect(page.locator('[data-canvas-root]').first()).toBeVisible();
      // Let fonts settle (local @workspec/design fonts).
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      await expect(frame).toHaveScreenshot(`${scenario}-${theme}.png`, {
        ...(PER_SCENARIO_OPTIONS[scenario] ?? {}),
      });
    });
  }
}
