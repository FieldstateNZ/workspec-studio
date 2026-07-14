import { spawn, type ChildProcess } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { parse as parseYaml } from 'yaml';
import { parseAttributionYaml, serializeAttributionYaml } from '@workspec/cost-schema';

// ─────────────────────────────────────────────────────────────────────────────
// Full standalone E2E — the whole loop against the REAL host (Express + Vite
// client + FsRepository), the `npx` runtime path exactly, over a TEMP COPY of
// `examples/fieldstate-azure-costs` with its three 100%-coverage cluster
// rules (`r9`–`r11`, see that example's own README) stripped back out — a
// "reduced coverage" copy that reproduces exactly the 81.2%-coverage golden
// numbers `@workspec/cost-ui`'s own `demo-smoke.test.tsx` already pins for
// this same underlying estate:
//
//   open the estate → all four views render → "Fix coverage →" → pick the
//   rg-legacy-misc cluster → "Add as r9" promotes it into a first-class rule
//   → coverage rises (81.2% → 90.0%, the exact projection the composer
//   itself showed) → the *.attribution.yaml ON DISK gained rule `r9` → a
//   rail reorder (moving r9 above r8) also persists to disk → the Dark/Light
//   theme toggle re-themes the whole shell.
//
// It boots the built server the way `npx` would:
//   node packages/cost-studio/dist/bin.js serve --dir <tempcopy>
// ─────────────────────────────────────────────────────────────────────────────

const HERE = dirname(fileURLToPath(import.meta.url));
const STUDIO_ROOT = resolve(HERE, '..');
const BIN = join(STUDIO_ROOT, 'dist', 'bin.js');
const EXAMPLE = resolve(STUDIO_ROOT, '../../examples/fieldstate-azure-costs');
const PORT = Number(process.env.E2E_PORT ?? 4189);
const BASE = `http://127.0.0.1:${PORT}`;

const ATTRIBUTION_FILE = 'fieldstate-azure.attribution.yaml';
const STRIPPED_RULE_IDS = new Set(['r9', 'r10', 'r11']);

let server: ChildProcess;
let tmpDir: string;
let attributionPath: string;

interface DiskRule {
  id: string;
  name: string;
  match?: Record<string, unknown>;
  assign?: Record<string, unknown>;
}
interface DiskAttribution {
  spec: { rules: DiskRule[] };
}

/** Read + YAML-parse the attribution file the running host is writing to. */
function readAttributionOnDisk(): DiskAttribution {
  return parseYaml(readFileSync(attributionPath, 'utf8')) as DiskAttribution;
}

async function waitForHealth(timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error('studio host did not become healthy in time');
    await new Promise((r) => setTimeout(r, 250));
  }
}

test.beforeAll(async () => {
  // 1. Temp copy of the worked example, so the app's writes never touch the repo tree.
  tmpDir = mkdtempSync(join(tmpdir(), 'cs-e2e-'));
  cpSync(EXAMPLE, tmpDir, { recursive: true });
  attributionPath = join(tmpDir, ATTRIBUTION_FILE);

  // 2. Strip r9–r11 (the cluster-promotion rules the worked example's README
  // documents) back out, via the SAME parse/serialize round trip that example
  // was itself produced by — reproducing exactly the 8-rule, 81.2%-coverage
  // golden estate `@workspec/cost-ui`'s demo-smoke test already pins.
  const before = parseAttributionYaml(readFileSync(attributionPath, 'utf8'));
  if (!before.ok) throw new Error(`fixture attribution failed to parse: ${JSON.stringify(before.errors)}`);
  const reduced = {
    ...before.data,
    spec: {
      ...before.data.spec,
      rules: before.data.spec.rules.filter((r) => !STRIPPED_RULE_IDS.has(r.id)),
    },
  };
  writeFileSync(attributionPath, serializeAttributionYaml(reduced));

  const diskBefore = readAttributionOnDisk();
  expect(diskBefore.spec.rules.map((r) => r.id)).toEqual(['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8']);

  // 3. Boot the BUILT server exactly as `npx @workspec/cost-studio` would.
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

test('all four views render — Inventory · Attribution · Reports · Plan review', async ({ page }) => {
  await page.goto('/');

  const tabs = page.getByRole('tablist', { name: 'Cost views' });
  await expect(tabs).toBeVisible();

  // Attribution is the default view — the coverage row renders immediately.
  await expect(page.locator('.cost-coverage-figure')).toHaveText('81.2%');

  await page.getByRole('tab', { name: 'Inventory' }).click();
  await expect(page.locator('.cost-inventory-strip-text')).toContainText('80 resources');

  await page.getByRole('tab', { name: 'Reports' }).click();
  await expect(page.getByText('Rollups')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export CSV' })).toBeVisible();

  await page.getByRole('tab', { name: 'Plan review' }).click();
  await expect(page.locator('.cost-plan-header-baseline')).toContainText('baseline: inventory asOf');

  // Leave the shell on Attribution for the tests that follow.
  await page.getByRole('tab', { name: 'Attribution' }).click();
  await expect(page.locator('.cost-coverage-figure')).toHaveText('81.2%');
});

test('Fix coverage → promote rg-legacy-misc into r9 — coverage rises and the file on disk gains the rule', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.cost-coverage-figure')).toHaveText('81.2%');
  await expect(page.getByRole('button', { name: 'Unattributed · 20' })).toBeVisible();

  await page.getByRole('button', { name: 'Fix coverage →' }).click();

  const cluster = page.getByRole('button', { name: 'rg-legacy-misc · 12 · $1,159' });
  await expect(cluster).toBeVisible();
  await cluster.click();

  // The composer opens, defaults to `product: shared` (the primary
  // dimension's declared "shared" value), and projects the exact same
  // 81.2% → 90.0% coverage jump `@workspec/cost-ui`'s own unit test pins for
  // this cluster.
  await expect(page.locator('.cost-composer-matcher')).toContainText('resourceGroup ~ rg-legacy-misc');
  await expect(page.locator('.cost-composer-projection')).toContainText('matches 12 · $1,159/mo');
  await expect(page.locator('.cost-composer-projection-delta')).toHaveText('90.0%');

  const addButton = page.getByRole('button', { name: 'Add as r9' });
  await expect(addButton).toBeVisible();
  await addButton.click();

  // The write landed: the coverage figure and the unattributed count both
  // update to match the projection shown before the click.
  await expect(page.locator('.cost-coverage-figure')).toHaveText('90.0%');
  await expect(page.getByRole('button', { name: 'Unattributed · 8' })).toBeVisible();

  // The new rule appears in the rail, removable (this session promoted it).
  await expect(page.locator('.cost-rule-id', { hasText: 'r9' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove rule r9' })).toBeVisible();

  // The *.attribution.yaml ON DISK gained exactly the rule the worked
  // example's own README documents as r9.
  await expect.poll(() => readAttributionOnDisk().spec.rules.map((r) => r.id)).toContain('r9');
  const disk = readAttributionOnDisk();
  const r9 = disk.spec.rules.find((r) => r.id === 'r9');
  expect(r9).toBeDefined();
  expect(r9?.name).toBe('promoted-rg-legacy-misc');
  expect(r9?.match).toEqual({ resourceGroup: 'rg-legacy-misc' });
  expect(r9?.assign).toEqual({ product: 'shared' });
});

test('rail reorder persists to disk', async ({ page }) => {
  await page.goto('/');
  // r9 (added by the previous test) starts below r8 in rail order.
  await expect(page.locator('.cost-rule-id', { hasText: 'r9' })).toBeVisible();

  const before = readAttributionOnDisk().spec.rules.map((r) => r.id);
  expect(before[before.length - 1]).toBe('r9');
  expect(before[before.length - 2]).toBe('r8');

  await page.getByRole('button', { name: 'Move rule r9 up' }).click();

  await expect
    .poll(() => readAttributionOnDisk().spec.rules.map((r) => r.id))
    .toEqual([...before.slice(0, before.length - 2), 'r9', 'r8']);

  // The rail's own rendered order agrees with the file.
  const ruleIds = await page.locator('.cost-rule-id').allTextContents();
  const r8Index = ruleIds.indexOf('r8');
  const r9Index = ruleIds.indexOf('r9');
  expect(r9Index).toBe(r8Index - 1);
});

test('Dark/Light theme toggle re-themes the shell', async ({ page }) => {
  await page.goto('/');

  const root = page.locator('.cost-root');
  await expect(root).toHaveCount(1);
  const initialTheme = await root.getAttribute('data-theme');
  expect(initialTheme === 'dark' || initialTheme === 'light').toBe(true);
  const other = initialTheme === 'dark' ? 'Light' : 'Dark';

  const otherButton = page.getByRole('button', { name: other });
  await expect(otherButton).toHaveAttribute('aria-pressed', 'false');
  await otherButton.click();

  await expect(root).toHaveAttribute('data-theme', other.toLowerCase());
  await expect(otherButton).toHaveAttribute('aria-pressed', 'true');
});
