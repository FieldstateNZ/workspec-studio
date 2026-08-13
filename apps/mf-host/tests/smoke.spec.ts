import { expect, test } from '@playwright/test';

// S6/S5/C6/topology integration smoke: the host loads the decision-ui,
// c4-ui, cost-ui, AND topology-ui remotes over module federation and mounts
// DecisionCard + DecisionWorkspace + C4Diagram + C4Explorer +
// AttributionWorkbench + CostReport + CostInventory + TagPlanView +
// TopologyWorkbench. Proven:
//   1. DecisionCard and DecisionWorkspace render the repository-native record
//      supplied by the host without a catalog dependency.
//   2. C4Diagram/C4Explorer render the in-memory C4 model's elements.
//   3. AttributionWorkbench renders its coverage meter and resource table over
//      the inline cost estate (see ../src/cost-seed.ts), CostReport renders its
//      stat cards, clicking the first resource row opens its cascade, and
//      clicking a rule's reorder button writes through `useWriteAttribution`
//      and visibly reorders the rail. Each of these interactions runs
//      entirely through the remote's own hooks (`useState`/`useMutation`), so
//      they only work with a single shared React — a read path AND a write
//      path, both proven. CostInventory and TagPlanView render their own
//      views (stock-take table, tag-plan review) over the same estate.
//   4. TopologyWorkbench renders its header/canvas over the in-memory
//      topology tree (see ../src/topology-seed.ts).
//   5. There is exactly ONE React instance across ALL FOUR remote boundaries —
//      proven by each remote's own reactProbe canary (remote's React ===
//      host's stamped React) AND by DecisionWorkspace's/C4Explorer's/
//      AttributionWorkbench's hooks running without an "invalid hook call"
//      (which a second React copy would throw).

test.describe('MF smoke — host consumes the decision-ui, c4-ui, cost-ui, and topology-ui remotes', () => {
  test('host mounts decision, c4, cost, and topology remotes on one React instance (reads + a cost write)', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    await page.goto('/');

    // ── 1. DecisionCard renders the record's authored decision ────────────────
    const card = page.locator('#card-mount .ds-card');
    await expect(card).toBeVisible();
    await expect(card.locator('.ds-card-title')).toHaveText(
      'Hosting platform for the data and delivery services',
    );
    await expect(card.locator('.ds-core-card-decision')).toContainText('AKS');

    // ── 2a. DecisionWorkspace (record + ADR preview) renders — its hooks run,
    //        which is only possible with a single shared React. ────────────────
    await expect(page.locator('#workspace-mount').getByLabel('Title', { exact: true })).toHaveValue(
      'Hosting platform for the data and delivery services',
    );

    // ── 2b. reactProbe: the remote sees the exact React the host stamped. ──────
    const probe = page.locator('#react-probe');
    await expect(probe).toHaveAttribute('data-same-instance', 'true');
    const remoteVersion = await probe.getAttribute('data-remote-react-version');
    const hostVersion = await probe.getAttribute('data-host-react-version');
    expect(remoteVersion).toBe(hostVersion);

    // ── 3. C4Diagram (single diagram) and C4Explorer (level tabs + canvas)
    //       render the in-memory C4 model's elements. The explorer's control is
    //       the workbench level tab ("1 · Context"), not the old title-named
    //       tree-nav button (c4-ui round-3 redesign). ──────────────────────────
    await expect(page.locator('#c4-diagram-mount').getByText('Architect')).toBeVisible();
    await expect(page.locator('#c4-diagram-mount').getByText('Payment Gateway')).toBeVisible();
    await expect(
      page.locator('#c4-explorer-mount').getByRole('button', { name: '1 · Context' }),
    ).toBeVisible();
    await expect(page.locator('#c4-explorer-mount').getByText('Architect')).toBeVisible();

    // ── 3b. c4-ui's own reactProbe: same single-instance proof, independently. ─
    const c4Probe = page.locator('#c4-react-probe');
    await expect(c4Probe).toHaveAttribute('data-same-instance', 'true');
    const c4RemoteVersion = await c4Probe.getAttribute('data-remote-react-version');
    expect(c4RemoteVersion).toBe(hostVersion);

    // ── 4a. AttributionWorkbench renders: the coverage meter is visible over
    //        the inline cost estate seeded by the host (../src/cost-seed.ts). ──
    const coverageTrack = page.locator('#cost-workbench-mount .cost-coverage-track');
    await expect(coverageTrack).toBeVisible();
    await expect(page.locator('#cost-workbench-mount .cost-coverage-figure')).toBeVisible();

    // ── 4b. End-to-end interaction through the singleton React: click the
    //        first resource row and its cascade appears. Only possible if the
    //        remote's `useState` (selectedResourceId) is the SAME React the
    //        rest of the page runs — a second React copy would throw
    //        "invalid hook call" the moment this click re-renders. ───────────
    const firstRow = page.locator('#cost-workbench-mount .cost-table-row').first();
    await expect(firstRow).toBeVisible();
    const cascade = page.locator('#cost-workbench-mount .cost-cascade').first();
    await expect(cascade).toBeHidden();
    await firstRow.click();
    await expect(cascade).toBeVisible();
    await expect(cascade.locator('.cost-cascade-row').first()).toBeVisible();

    // ── 4c. CostReport renders its stat cards over the same estate. ───────────
    await expect(page.locator('#cost-report-mount .cost-stat-eyebrow').first()).toHaveText(
      'Total spend',
    );

    // ── 4d. cost-ui's own reactProbe: same single-instance proof, independently. ─
    const costProbe = page.locator('#cost-react-probe');
    await expect(costProbe).toHaveAttribute('data-same-instance', 'true');
    const costRemoteVersion = await costProbe.getAttribute('data-remote-react-version');
    expect(costRemoteVersion).toBe(hostVersion);

    // ── 4e. Write-path proof: click rule r1's reorder-down button (the ▼ next
    //        to rule 1 — equivalently rule 2's ▲, both swap the same pair) and
    //        assert the rail's visible order changes. This exercises
    //        `useWriteAttribution`'s mutation through the remote's own
    //        `useMutation` hook against the host's in-memory repository — a
    //        real write across the MF seam, not just a read — and the
    //        existing console-error tracking confirms the mutation raised
    //        nothing. ──────────────────────────────────────────────────────
    const errorsBeforeReorder = consoleErrors.length;
    const railRuleIds = page.locator('#cost-workbench-mount .cost-rule-row .cost-rule-id');
    await expect(railRuleIds.first()).toHaveText('r1');
    await page.getByRole('button', { name: 'Move rule r1 down' }).click();
    await expect(railRuleIds.first()).toHaveText('r2');
    const reorderErrors = consoleErrors.slice(errorsBeforeReorder);
    expect(
      reorderErrors,
      `unexpected console errors from the rule-reorder write:\n${reorderErrors.join('\n')}`,
    ).toEqual([]);

    // ── 4f. CostInventory renders its stock-take table over the same estate,
    //        as a fourth cost-ui view sharing the one CostStudioProvider. ─────
    await expect(page.locator('#cost-inventory-mount .cost-inventory-table')).toBeVisible();

    // ── 4g. TagPlanView renders its plan header + action counts over the
    //        inline TagPlan seed (../src/cost-seed.ts). ───────────────────────
    await expect(page.locator('#cost-tagplan-mount .cost-plan-counts')).toBeVisible();

    // ── 4h. TopologyWorkbench renders its header (topology title) and canvas
    //        over the in-memory topology tree seeded by the host
    //        (../src/topology-seed.ts). ─────────────────────────────────────
    await expect(page.locator('#topology-workbench-mount .tp-header-heading')).toHaveText(
      'MF Host Web App',
    );
    await expect(page.locator('#topology-workbench-mount .tp-canvas')).toBeVisible();

    // ── 4i. topology-ui's own reactProbe: same single-instance proof, independently. ─
    const topologyProbe = page.locator('#topology-react-probe');
    await expect(topologyProbe).toHaveAttribute('data-same-instance', 'true');
    const topologyRemoteVersion = await topologyProbe.getAttribute('data-remote-react-version');
    expect(topologyRemoteVersion).toBe(hostVersion);

    // ── 5. No duplicate-React / invalid-hook errors leaked to the console. ─────
    const reactErrors = consoleErrors.filter((text) =>
      /invalid hook call|copies of react|two copies of react|hooks can only be called/i.test(text),
    );
    expect(reactErrors, `unexpected React errors:\n${consoleErrors.join('\n')}`).toEqual([]);
  });
});
