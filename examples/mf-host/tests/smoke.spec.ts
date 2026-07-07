import { expect, test } from '@playwright/test';

// S6 integration smoke: the host loads the decision-ui remote over module
// federation and mounts DecisionCard + DecisionWorkspace. Two things are proven:
//   1. DecisionCard renders the correct golden cost (the recommended AKS annual,
//      $54,336.58) — the remote computes it with the bundled engine over the
//      MemoryRepository the host seeded from the hosting-platform fixtures.
//   2. There is exactly ONE React instance across the boundary — proven both by
//      the reactProbe canary (remote's React === host's stamped React) AND by
//      DecisionWorkspace's hooks running without an "invalid hook call" (which a
//      second React copy would throw).

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

    // ── 2c. No duplicate-React / invalid-hook errors leaked to the console. ────
    const reactErrors = consoleErrors.filter((text) =>
      /invalid hook call|copies of react|two copies of react|hooks can only be called/i.test(text),
    );
    expect(reactErrors, `unexpected React errors:\n${consoleErrors.join('\n')}`).toEqual([]);
  });
});
