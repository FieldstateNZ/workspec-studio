import { spawn, type ChildProcess } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { parse as parseYaml } from 'yaml';

// ─────────────────────────────────────────────────────────────────────────────
// Full standalone E2E — the whole loop against the REAL host (Express + Vite
// client + FsRepository), the `npx` runtime path exactly:
//
//   open the example → toggle a lever → cost changes → decide (winner +
//   rationale) → ADR renders as Accepted → the *.decision.yaml ON DISK gained
//   `status: decided` + a recorded `spec.outcome`.
//
// It runs over a TEMP COPY of examples/hosting-platform so the writes the app makes
// never dirty the repo, and boots the built server the way `npx` would:
//   node packages/studio/dist/bin.js serve --dir <tempcopy>
// ─────────────────────────────────────────────────────────────────────────────

const HERE = dirname(fileURLToPath(import.meta.url));
const STUDIO_ROOT = resolve(HERE, '..');
const BIN = join(STUDIO_ROOT, 'dist', 'bin.js');
const EXAMPLE = resolve(STUDIO_ROOT, '../../examples/hosting-platform');
const PORT = Number(process.env.E2E_PORT ?? 4188);
const BASE = `http://127.0.0.1:${PORT}`;

const DECISION_FILE = 'hosting-platform.decision.yaml';

let server: ChildProcess;
let tmpDir: string;
let decisionPath: string;

interface DiskLever {
  id: string;
  enabled?: boolean;
}
interface DiskOption {
  id: string;
  levers?: DiskLever[];
}
interface DiskDecision {
  metadata: { status: string };
  spec: {
    options: DiskOption[];
    outcome?: { option: string; rationale: string; decidedAt?: string };
  };
}

/** Read + YAML-parse the decision file the running host is writing to. */
function readDecisionOnDisk(): DiskDecision {
  return parseYaml(readFileSync(decisionPath, 'utf8')) as DiskDecision;
}

/** The persisted `enabled` state of a named lever on a named option. */
function leverEnabledOnDisk(optionId: string, leverId: string): boolean | undefined {
  const option = readDecisionOnDisk().spec.options.find((o) => o.id === optionId);
  return option?.levers?.find((l) => l.id === leverId)?.enabled;
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
  // 1. Temp copy of the example, so the app's writes never touch the repo tree.
  tmpDir = mkdtempSync(join(tmpdir(), 'ds-e2e-'));
  cpSync(EXAMPLE, tmpDir, { recursive: true });
  decisionPath = join(tmpDir, DECISION_FILE);

  // Sanity: the copy starts life `exploring` with no outcome.
  const before = readDecisionOnDisk();
  expect(before.metadata.status).toBe('exploring');
  expect(before.spec.outcome).toBeUndefined();

  // 2. Boot the BUILT server exactly as `npx @workspec/decision-studio` would.
  server = spawn(
    'node',
    [BIN, 'serve', '--dir', tmpDir, '--port', String(PORT), '--host', '127.0.0.1'],
    {
      stdio: 'inherit',
    },
  );
  await waitForHealth();
});

test.afterAll(() => {
  server?.kill('SIGTERM');
  if (tmpDir !== undefined) rmSync(tmpDir, { recursive: true, force: true });
});

test('open → toggle lever → cost changes → decide → ADR → YAML on disk updated', async ({
  page,
}) => {
  await page.goto('/');

  // ── Open the example ────────────────────────────────────────────────────────
  // The shell auto-selects the only decision; the first option card (AKS) opens.
  const aksCard = page.locator('.ds-opt').first();
  await expect(aksCard.locator('.ds-opt-title')).toContainText('AKS');
  // Header status starts as "Exploring".
  await expect(page.locator('.ds-status').first()).toContainText('Exploring');

  // Capture a real workspace screenshot for the README (local run only — CI does
  // not set SCREENSHOT_OUT, so it never rewrites the committed asset).
  if (process.env.SCREENSHOT_OUT !== undefined) {
    await expect(aksCard.locator('.ds-opt-annual .ds-v')).toHaveText('$54,336.58');
    await page.screenshot({ path: process.env.SCREENSHOT_OUT, fullPage: true });
  }

  // ── Toggle a lever → cost changes ───────────────────────────────────────────
  const annual = aksCard.locator('.ds-opt-annual .ds-v');
  const before = (await annual.textContent())?.trim();
  expect(before).toBe('$54,336.58'); // golden AKS annual, default levers

  const reserve = aksCard.getByRole('switch', { name: 'Reserve steady prod' });
  await expect(reserve).toHaveAttribute('aria-checked', 'false');
  await reserve.click();
  await expect(reserve).toHaveAttribute('aria-checked', 'true');

  // Reserving steady prod (→ ri3, 0.5×) must move the annual number.
  await expect(annual).not.toHaveText(before ?? '');
  const after = (await annual.textContent())?.trim();
  expect(after).not.toBe(before);

  // The lever write is persisted through the port — the file changed on disk.
  await expect.poll(() => leverEnabledOnDisk('aks', 'reserveProd')).toBe(true);

  // ── Decide: go to the ADR view and record the outcome ───────────────────────
  await page.getByRole('button', { name: 'Decide' }).click();

  // The ADR renders from the same model the CLI's render-adr serialises.
  await expect(page.locator('.ds-adr-title')).toContainText('Hosting platform');

  // Pick the winner (pre-seeded to the engine recommendation) + a rationale.
  const winnerSelect = page.getByLabel('Winning option');
  await expect(winnerSelect).toBeVisible();
  await winnerSelect.selectOption('aks');
  const rationale = page.getByLabel('Decision rationale');
  await rationale.fill(
    'We accept higher day-2 ops burden in exchange for an unbounded scale ceiling.',
  );

  // The rail "Decide" button records the outcome and writes through the port.
  await page.locator('.ds-adr-rail').getByRole('button', { name: 'Decide' }).click();

  // ── ADR now renders as Accepted, AKS is the chosen option ───────────────────
  await expect(page.locator('.ds-adr-doc .ds-status')).toContainText('Accepted');
  const winningCard = page.locator('.ds-ac-win');
  await expect(winningCard).toContainText('AKS');
  await expect(winningCard).toContainText('chosen');

  // ── The *.decision.yaml ON DISK gained status:decided + a recorded outcome ──
  await expect.poll(() => readDecisionOnDisk().metadata.status).toBe('decided');
  const disk = readDecisionOnDisk();
  expect(disk.metadata.status).toBe('decided');
  expect(disk.spec.outcome).toBeDefined();
  expect(disk.spec.outcome?.option).toBe('aks');
  expect(disk.spec.outcome?.rationale).toContain('unbounded scale ceiling');
});
