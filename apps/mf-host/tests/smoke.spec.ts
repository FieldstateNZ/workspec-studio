import { expect, test } from '@playwright/test';

// S6/S5 integration smoke: the host loads the decision-ui AND c4-ui remotes
// over module federation and mounts DecisionCard + DecisionWorkspace +
// C4Diagram + C4Explorer. Proven:
//   1. DecisionCard renders the correct golden cost (the recommended AKS annual,
//      $54,336.58) — the remote computes it with the bundled engine over the
//      MemoryRepository the host seeded from the hosting-platform fixtures.
//   2. C4Diagram/C4Explorer render the in-memory C4 model's elements.
//   3. There is exactly ONE React instance across BOTH remote boundaries —
//      proven by each remote's own reactProbe canary (remote's React ===
//      host's stamped React) AND by DecisionWorkspace's/C4Explorer's hooks
//      running without an "invalid hook call" (which a second React copy
//      would throw).

test.describe('MF smoke — host consumes the @workspec/decision-ui remote', () => {
  test('DecisionCard shows the golden cost and React is a single instance', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    await page.goto('/');

    // ── 1. DecisionCard renders the recommended option + its annual cost ──────
    const card = page.locator('#card-mount .ds-card');
    await expect(card).toBeVisible();
    await expect(card.locator('.ds-card-title')).toHaveText(
      'Hosting platform for the data and delivery services',
    );
    await expect(card.locator('.ds-card-choice-lab')).toHaveText('Recommended');
    await expect(card.locator('.ds-card-choice-nm')).toHaveText('AKS');
    await expect(card.locator('.ds-card-cost-v')).toHaveText('$54,336.58');

    // ── 2a. DecisionWorkspace (the full four-view app) renders — its hooks run,
    //        which is only possible with a single shared React. ────────────────
    await expect(page.locator('#workspace-mount .ds-opt-title').first()).toContainText('AKS');

    // ── 2b. reactProbe: the remote sees the exact React the host stamped. ──────
    const probe = page.locator('#react-probe');
    await expect(probe).toHaveAttribute('data-same-instance', 'true');
    const remoteVersion = await probe.getAttribute('data-remote-react-version');
    const hostVersion = await probe.getAttribute('data-host-react-version');
    expect(remoteVersion).toBe(hostVersion);

    // ── 3. C4Diagram (single diagram) and C4Explorer (tree nav + canvas) render
    //       the in-memory C4 model's elements. ─────────────────────────────────
    await expect(page.locator('#c4-diagram-mount').getByText('Architect')).toBeVisible();
    await expect(page.locator('#c4-diagram-mount').getByText('Payment Gateway')).toBeVisible();
    await expect(
      page.locator('#c4-explorer-mount').getByRole('button', { name: /System Context/i }),
    ).toBeVisible();
    await expect(page.locator('#c4-explorer-mount').getByText('Architect')).toBeVisible();

    // ── 3b. c4-ui's own reactProbe: same single-instance proof, independently. ─
    const c4Probe = page.locator('#c4-react-probe');
    await expect(c4Probe).toHaveAttribute('data-same-instance', 'true');
    const c4RemoteVersion = await c4Probe.getAttribute('data-remote-react-version');
    expect(c4RemoteVersion).toBe(hostVersion);

    // ── 4. No duplicate-React / invalid-hook errors leaked to the console. ─────
    const reactErrors = consoleErrors.filter((text) =>
      /invalid hook call|copies of react|two copies of react|hooks can only be called/i.test(text),
    );
    expect(reactErrors, `unexpected React errors:\n${consoleErrors.join('\n')}`).toEqual([]);
  });
});
