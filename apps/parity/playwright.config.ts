import { defineConfig } from '@playwright/test';

// Deterministic parity goldens: one browser (chromium), fixed viewport,
// device scale 2 (crisp text like the enterprise references), animations
// disabled per screenshot, local @workspec/design fonts (no network).
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  retries: 0,
  workers: 1,
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.001,
    },
  },
  use: {
    viewport: { width: 1280, height: 840 },
    deviceScaleFactor: 2,
  },
  webServer: {
    command: 'pnpm exec vite preview',
    port: 4517,
    reuseExistingServer: false,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
