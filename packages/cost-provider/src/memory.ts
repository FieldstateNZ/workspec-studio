import {
  InventoryArtifact,
  InventoryResource,
  SpendArtifact,
  TagPlanArtifact,
  API_VERSION,
  compareResourceIds,
  compareSpendRows,
} from '@workspec/cost-schema';
import type {
  Inventory,
  InventoryResourceType,
  Spend,
  SpendRowType,
  TagPlan,
  TagPlanEntryType,
} from '@workspec/cost-schema';
import { computeDriftReport } from './drift.js';
import type { DriftableResource } from './drift.js';
import type { CloudProviderPort, ProviderScope } from './port.js';
import type { ApplyEntryResult, ApplyResult, DriftReport } from './types.js';

// ── The memory double ───────────────────────────────────────────────────────
// A STATEFUL in-memory `CloudProviderPort` — the UI/CLI test double, and what
// exercises the stocktake → plan → apply → re-stocktake loop in tests without
// any real cloud call. Factory-built (never a shared mutable module
// singleton), Zod-validates on the way in, and deep-clones on every read so a
// caller mutating a returned artifact can never corrupt the store — same
// contract as `@workspec/decision-schema`'s `createMemoryRepository`.

function cloneJson<T>(value: T): T {
  return structuredClone(value);
}

function firstIssue(error: { issues: { path: PropertyKey[]; message: string }[] }): string {
  const issue = error.issues[0];
  return issue ? `${issue.path.join('.') || '<root>'}: ${issue.message}` : 'invalid';
}

/**
 * Deterministic default clock for {@link createMemoryProvider}: a fixed ISO
 * instant, NEVER `Date.now()`. Determinism is a contract here — two
 * providers seeded identically and never mutated must serialize identical
 * `fetchInventory` output (see `memory.test.ts`'s determinism assertion).
 */
export const DEFAULT_MEMORY_CLOCK = (): string => '2024-01-01T00:00:00.000Z';

/** Seed data for {@link createMemoryProvider}. */
export interface MemoryProviderSeed {
  /**
   * The initial stock-take: defines both the live resource/tag state and
   * (via `metadata`) the identity `fetchInventory` snapshots reuse.
   * Zod-validated and deep-cloned on the way in.
   */
  inventory: Inventory;
  /**
   * Spend artifacts to seed. `fetchSpend` flattens every seeded artifact's
   * `spec.rows[]` and filters by the requested period — rows don't need to
   * be pre-grouped by period or artifact. Zod-validated and deep-cloned on
   * the way in. Defaults to none.
   */
  spend?: Spend[];
  /**
   * Clock used for `asOf` on every `fetchInventory` snapshot. Defaults to
   * {@link DEFAULT_MEMORY_CLOCK} — never wall-clock time — so the double is
   * deterministic unless a caller deliberately opts out.
   */
  clock?: () => string;
}

/**
 * The memory double's port, plus test-only escape hatches for injecting live
 * drift that didn't come through `applyTags` — e.g. simulating someone
 * hand-editing a resource's tags outside WorkSpec, so `verifyBaseline` has
 * something real to detect. Kept off `CloudProviderPort` itself (the port
 * stays exactly four methods); a `MemoryCloudProvider` is still perfectly
 * usable wherever a `CloudProviderPort` is expected.
 */
export interface MemoryCloudProvider extends CloudProviderPort {
  /**
   * Replace a live resource's tags wholesale (validated the same way the
   * schema would validate them). Pass `tags: null` to make the resource
   * disappear from live state entirely (simulating deletion) — this is how
   * tests produce a `'resource-disappeared'` drift. Throws if `resourceId`
   * isn't currently live; use {@link addLiveResource} to introduce a new one.
   */
  mutateLive(resourceId: string, tags: Record<string, string> | null): void;
  /**
   * Introduce a brand-new resource into live state that was never part of
   * the seed inventory — this is how tests produce a `'resource-appeared'`
   * drift. Validated via the `InventoryResource` schema.
   */
  addLiveResource(resource: InventoryResourceType): void;
}

function nonNullDesired(entry: TagPlanEntryType): string {
  if (entry.desired === null) {
    // Unreachable in practice: TagPlanArtifact's superRefine guarantees
    // `desired` is non-null whenever `action` is 'add' or 'change'.
    throw new Error(
      `applyTags: entry for "${entry.resourceId}"/"${entry.tag}" has action "${entry.action}" but desired is null`,
    );
  }
  return entry.desired;
}

function nonNullCurrent(entry: TagPlanEntryType): string {
  if (entry.current === null) {
    // Unreachable in practice: TagPlanArtifact's superRefine guarantees
    // `current` is non-null whenever `action` is 'remove'.
    throw new Error(
      `applyTags: entry for "${entry.resourceId}"/"${entry.tag}" has action "${entry.action}" but current is null`,
    );
  }
  return entry.current;
}

/**
 * Build an in-memory {@link CloudProviderPort} seeded from `seed`.
 *
 * Supports the full CLI loop: `fetchInventory` (stock-take) →
 * hand-build-or-load a TagPlan against it → `applyTags` (apply, or
 * `dryRun` to preview) → `fetchInventory` again (re-stock-take) shows
 * converged tags. `verifyBaseline` lets a caller (the CLI, or a test) check
 * live state against an earlier stock-take before trusting a plan computed
 * from it.
 */
export function createMemoryProvider(seed: MemoryProviderSeed): MemoryCloudProvider {
  const seedInventoryResult = InventoryArtifact.safeParse(cloneJson(seed.inventory));
  if (!seedInventoryResult.success) {
    throw new Error(`createMemoryProvider: invalid seed inventory (${firstIssue(seedInventoryResult.error)})`);
  }
  const seedInventory = seedInventoryResult.data;
  const clock = seed.clock ?? DEFAULT_MEMORY_CLOCK;

  const live = new Map<string, InventoryResourceType>();
  for (const resource of seedInventory.spec.resources) {
    live.set(resource.id, cloneJson(resource));
  }

  const spendArtifacts = (seed.spend ?? []).map((entry, index) => {
    const result = SpendArtifact.safeParse(cloneJson(entry));
    if (!result.success) {
      throw new Error(`createMemoryProvider: invalid seed spend[${index}] (${firstIssue(result.error)})`);
    }
    return result.data;
  });

  function asDriftable(map: ReadonlyMap<string, InventoryResourceType>): ReadonlyMap<string, DriftableResource> {
    return map;
  }

  return {
    fetchInventory(scope: ProviderScope): Promise<Inventory> {
      // Mirrors a real provider's "list resources in these subscriptions"
      // semantics: only resources whose subscription is in scope come back.
      // An empty `scope.subscriptions` is scoped to nothing, on purpose.
      const subscriptions = new Set(scope.subscriptions);
      const resources = [...live.values()]
        .filter((resource) => subscriptions.has(resource.subscription))
        .sort((a, b) => compareResourceIds(a.id, b.id))
        .map(cloneJson);

      const candidate: Inventory = {
        apiVersion: API_VERSION,
        kind: 'Inventory',
        metadata: cloneJson(seedInventory.metadata),
        spec: {
          asOf: clock(),
          scope: { subscriptions: [...scope.subscriptions] },
          resources,
        },
      };

      const parsed = InventoryArtifact.safeParse(candidate);
      if (!parsed.success) {
        // Unreachable: every piece above is already schema-valid.
        throw new Error(`fetchInventory: constructed an invalid Inventory (${firstIssue(parsed.error)})`);
      }
      return Promise.resolve(parsed.data);
    },

    fetchSpend(_scope: ProviderScope, period: string): Promise<Spend> {
      const rows: SpendRowType[] = spendArtifacts
        .flatMap((artifact) => artifact.spec.rows)
        .filter((row) => row.period === period)
        .map(cloneJson)
        .sort(compareSpendRows);

      const candidate: Spend = {
        apiVersion: API_VERSION,
        kind: 'Spend',
        metadata: { id: period },
        spec: { rows },
      };

      const parsed = SpendArtifact.safeParse(candidate);
      if (!parsed.success) {
        // Unreachable: every seeded row was already schema-valid, and
        // filtering/sorting doesn't change that.
        throw new Error(`fetchSpend: constructed an invalid Spend (${firstIssue(parsed.error)})`);
      }
      return Promise.resolve(parsed.data);
    },

    applyTags(planInput: TagPlan, options?: { dryRun?: boolean }): Promise<ApplyResult> {
      const planResult = TagPlanArtifact.safeParse(cloneJson(planInput));
      if (!planResult.success) {
        return Promise.reject(new Error(`applyTags: invalid TagPlan (${firstIssue(planResult.error)})`));
      }
      const plan = planResult.data;
      const dryRun = options?.dryRun ?? false;

      const results: ApplyEntryResult[] = [];
      let applied = 0;
      let failed = 0;
      let skippedNoop = 0;

      for (const entry of plan.spec.entries) {
        const resource = live.get(entry.resourceId);
        if (resource === undefined) {
          results.push({
            resourceId: entry.resourceId,
            tag: entry.tag,
            action: entry.action,
            ok: false,
            error: `resource "${entry.resourceId}" not found in live state`,
          });
          failed += 1;
          continue;
        }

        if (entry.action === 'noop') {
          results.push({ resourceId: entry.resourceId, tag: entry.tag, action: entry.action, ok: true });
          skippedNoop += 1;
          continue;
        }

        if (entry.action === 'remove') {
          // Value-matched, mirroring `@workspec/cost-provider-azure`'s real
          // adapter: ARM's Tags Update-At-Scope `Delete` operation matches on
          // tag NAME AND VALUE when a value is supplied, so a live value that
          // has drifted from the plan's recorded `current` since the plan was
          // computed must be reported as a failure, never silently deleted
          // (or silently left alone while reporting success).
          const liveValue = resource.tags?.[entry.tag];
          const expectedCurrent = nonNullCurrent(entry);
          if (liveValue !== expectedCurrent) {
            results.push({
              resourceId: entry.resourceId,
              tag: entry.tag,
              action: entry.action,
              ok: false,
              error:
                `remove is value-matched: live value of "${entry.tag}" on "${entry.resourceId}" is ` +
                `${liveValue === undefined ? '(not set)' : JSON.stringify(liveValue)}, which does not match ` +
                `the plan's recorded current value ${JSON.stringify(expectedCurrent)}`,
            });
            failed += 1;
            continue;
          }
          if (!dryRun && resource.tags !== undefined) {
            // Computed-key rest destructuring, not `delete`, to avoid
            // @typescript-eslint/no-dynamic-delete.
            const { [entry.tag]: _dropped, ...rest } = resource.tags;
            resource.tags = rest;
          }
        } else if (!dryRun) {
          resource.tags = { ...(resource.tags ?? {}), [entry.tag]: nonNullDesired(entry) };
        }

        results.push({ resourceId: entry.resourceId, tag: entry.tag, action: entry.action, ok: true });
        applied += 1;
      }

      return Promise.resolve({ results, applied, failed, skippedNoop, dryRun });
    },

    verifyBaseline(baselineInput: Inventory, resourceIds?: string[]): Promise<DriftReport> {
      const baselineResult = InventoryArtifact.safeParse(cloneJson(baselineInput));
      if (!baselineResult.success) {
        return Promise.reject(new Error(`verifyBaseline: invalid baseline Inventory (${firstIssue(baselineResult.error)})`));
      }
      const baseline = baselineResult.data;

      const baselineById = new Map<string, InventoryResourceType>(
        baseline.spec.resources.map((resource) => [resource.id, resource]),
      );
      const targetIds =
        resourceIds !== undefined
          ? [...new Set(resourceIds)].sort(compareResourceIds)
          : [...baselineById.keys()].sort(compareResourceIds);

      return Promise.resolve(computeDriftReport(targetIds, asDriftable(baselineById), asDriftable(live)));
    },

    mutateLive(resourceId: string, tags: Record<string, string> | null): void {
      if (tags === null) {
        live.delete(resourceId);
        return;
      }
      const existing = live.get(resourceId);
      if (existing === undefined) {
        throw new Error(`mutateLive: no live resource "${resourceId}" — use addLiveResource to introduce a new one`);
      }
      const candidate = { ...existing, tags: cloneJson(tags) };
      const parsed = InventoryResource.safeParse(candidate);
      if (!parsed.success) {
        throw new Error(`mutateLive: invalid tags for "${resourceId}" (${firstIssue(parsed.error)})`);
      }
      live.set(resourceId, parsed.data);
    },

    addLiveResource(resource: InventoryResourceType): void {
      const parsed = InventoryResource.safeParse(cloneJson(resource));
      if (!parsed.success) {
        throw new Error(`addLiveResource: invalid resource (${firstIssue(parsed.error)})`);
      }
      live.set(parsed.data.id, parsed.data);
    },
  };
}
