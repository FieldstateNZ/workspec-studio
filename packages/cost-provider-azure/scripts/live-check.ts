// MANUAL live-Azure smoke check for `@workspec/cost-provider-azure`.
//
//   WORKSPEC_COST_LIVE_CHECK=1 WORKSPEC_COST_LIVE_CHECK_SUBSCRIPTION=<sub-id> \
//     pnpm --filter @workspec/cost-provider-azure live-check
//
// This is the ONLY place a real Azure call can happen from this package —
// it is NOT wired into `pnpm test`, `pnpm build`, `pnpm typecheck`, `pnpm
// lint`, or any CI workflow. Running it with no env vars set is a safe
// no-op (it prints instructions and exits 0) specifically so an accidental
// `pnpm -r run live-check` (there is no such aggregate script today, but
// just in case one is ever added) can never make a live call by accident.
//
// Requires `az login` (or another credential in `DefaultAzureCredential`'s
// chain) to already be authenticated, and `Reader` on the subscription
// (Resource Graph + Cost Management read access) — see the package README.
//
// Exercises every port method against the real Azure REST endpoints:
// fetchInventory, fetchSpend (current month), verifyBaseline (against the
// inventory just fetched — should report inSync), and applyTags with
// `dryRun: true` only (this script NEVER mutates real tags).
import process from 'node:process';
import { createAzureProvider } from '../src/index.js';

async function main(): Promise<void> {
  if (process.env['WORKSPEC_COST_LIVE_CHECK'] !== '1') {
    console.log(
      'live-check: no-op (set WORKSPEC_COST_LIVE_CHECK=1 and WORKSPEC_COST_LIVE_CHECK_SUBSCRIPTION=<sub-id> to run against real Azure)',
    );
    return;
  }

  const subscriptionId = process.env['WORKSPEC_COST_LIVE_CHECK_SUBSCRIPTION'];
  if (subscriptionId === undefined || subscriptionId.length === 0) {
    throw new Error('live-check: WORKSPEC_COST_LIVE_CHECK_SUBSCRIPTION must be set to a real subscription id');
  }

  const provider = createAzureProvider();
  const scope = { subscriptions: [subscriptionId] };

  console.log(`live-check: fetching inventory for subscription "${subscriptionId}"...`);
  const inventory = await provider.fetchInventory(scope);
  console.log(`live-check: ${inventory.spec.resources.length} resource(s) as of ${inventory.spec.asOf}`);

  const period = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  console.log(`live-check: fetching spend for period "${period}"...`);
  const spend = await provider.fetchSpend(scope, period);
  console.log(`live-check: ${spend.spec.rows.length} spend row(s)`);

  console.log('live-check: verifying the inventory we just fetched against itself (expect inSync: true)...');
  const report = await provider.verifyBaseline(inventory);
  console.log(`live-check: inSync=${report.inSync}, drifts=${report.drifts.length}`);

  console.log('live-check: exercising applyTags wiring with an empty, dryRun-only plan (mutates nothing)...');
  const emptyDryRunPlan = {
    apiVersion: 'workspec.io/v1alpha1' as const,
    kind: 'TagPlan' as const,
    metadata: { slug: 'live-check-noop' },
    spec: { baselineAsOf: inventory.spec.asOf, tagMapping: { 'live-check': 'workspec-live-check' }, entries: [] },
  };
  const applyResult = await provider.applyTags(emptyDryRunPlan, { dryRun: true });
  console.log(`live-check: applyTags dryRun result — applied=${applyResult.applied}, dryRun=${applyResult.dryRun}`);

  console.log('live-check: done — no tags were mutated (dryRun-only script).');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
