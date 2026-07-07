import { defineConfig } from '@playwright/test';

// Playwright smoke config. The `webServer` starts the tiny static server
// (serve.ts) which serves the already-built host + remote; `pnpm smoke` builds
// both first. Uses the bundled Chromium (PLAYWRIGHT_BROWSERS_PATH points at the
// pre-installed browser locally; CI installs it via `playwright install`).

const PORT = Number(process.env.PORT ?? 4390);

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    browserName: 'chromium',
  },
  webServer: {
    command: 'pnpm exec tsx serve.ts',
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: { PORT: String(PORT) },
  },
});
