import { defineConfig } from '@playwright/test';

// Standalone end-to-end config. Unlike the mf-host smoke (which serves a static
// build), this drives the REAL studio host: the spec's `beforeAll` copies the
// hosting-platform example into a temp dir and boots `node dist/bin.js serve --dir <tmp>`,
// so the test can mutate the on-disk YAML and assert the write landed. The
// browser is the pre-installed Chromium (PLAYWRIGHT_BROWSERS_PATH locally; CI
// runs `playwright install --with-deps chromium`). Files are named `*.e2e.ts`
// so Vitest (which globs `*.test.ts`) never tries to run them.

const PORT = Number(process.env.E2E_PORT ?? 4188);

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.e2e.ts',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    browserName: 'chromium',
    // Chromium refuses to run as root without this; harmless elsewhere.
    launchOptions: { args: ['--no-sandbox'] },
  },
});
