import { spawn, type ChildProcess } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { parse as parseYaml } from 'yaml';

const HERE = dirname(fileURLToPath(import.meta.url));
const STUDIO_ROOT = resolve(HERE, '..');
const BIN = join(STUDIO_ROOT, 'dist', 'bin.js');
const EXAMPLE = resolve(STUDIO_ROOT, '../../examples/hosting-platform');
const PORT = Number(process.env.E2E_PORT ?? 4188);
const BASE = `http://127.0.0.1:${PORT}`;
const DECISION_FILE = '.workspec/decisions/hosting-platform.yaml';

let server: ChildProcess;
let tmpDir: string;
let decisionPath: string;

function readDecisionOnDisk(): { spec: { title: string; decision: string; status: string } } {
  return parseYaml(readFileSync(decisionPath, 'utf8')) as {
    spec: { title: string; decision: string; status: string };
  };
}

async function waitForHealth(timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return;
    } catch {
      /* not ready */
    }
    if (Date.now() > deadline) throw new Error('studio host did not become healthy in time');
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
}

test.beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ds-e2e-'));
  cpSync(EXAMPLE, tmpDir, { recursive: true });
  decisionPath = join(tmpDir, DECISION_FILE);
  server = spawn(
    'node',
    [BIN, 'serve', '--dir', tmpDir, '--port', String(PORT), '--host', '127.0.0.1'],
    { stdio: 'inherit' },
  );
  await waitForHealth();
});

test.afterAll(() => {
  server?.kill('SIGTERM');
  if (tmpDir !== undefined) rmSync(tmpDir, { recursive: true, force: true });
});

test('view → edit → write → view → YAML updated', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('WorkSpec', { exact: true })).toBeVisible();
  await expect(page.getByText('Decision Studio', { exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.locator('.ds-root')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('.ds-root')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('button', { name: 'Switch to dark theme' })).toBeVisible();

  const decisionNav = page.getByRole('navigation', { name: 'Decisions' });
  await expect(decisionNav).toBeVisible();
  await expect(
    decisionNav.getByRole('button', {
      name: /Hosting platform for the data and delivery services/,
    }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('combobox', { name: 'Decision' })).toHaveCount(0);

  await expect(
    page.getByRole('heading', { name: 'Hosting platform for the data and delivery services' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(
    'Hosting platform for the data and delivery services',
  );
  await expect(page.getByText('proposed', { exact: true }).first()).toBeVisible();

  const decision = page.getByRole('textbox', { name: 'Decision', exact: true });
  await decision.fill('Adopt AKS as the hosting platform.');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved to the repository.')).toBeVisible();

  await expect
    .poll(() => readDecisionOnDisk().spec.decision)
    .toBe('Adopt AKS as the hosting platform.');

  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { name: 'Decision', exact: true })).toBeVisible();
  await expect(page.getByText('Adopt AKS as the hosting platform.')).toBeVisible();
});
