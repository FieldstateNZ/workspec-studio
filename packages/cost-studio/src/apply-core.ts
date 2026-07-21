// The `apply` domain core — shared by the CLI's `apply` command (`cli.ts`'s
// `runApply`, which parses the positional `<plan-file>` + `--dry-run` and
// prints per-entry results) and the `cost_apply` MCP tool
// (`mcp-tools/apply-tool.ts`). Owns finding the plan's baseline inventory
// (refusing if zero or more-than-one inventory shares its `baselineAsOf`),
// verifying the provider's live state hasn't drifted since, and applying (or
// dry-running) the plan's tags.

import { compareResourceIds } from '@workspec/cost-schema';
import type { CostRepositoryPort, Inventory, TagPlan } from '@workspec/cost-schema';
import type { ApplyResult, CloudProviderPort, Drift } from '@workspec/cost-provider';

/** Inputs a caller has already extracted from its own arg surface. */
export interface ApplyParams {
  /** Ref of the tag plan to apply. */
  readonly planRef: string;
  /** Simulate only — no live resource is mutated. */
  readonly dryRun: boolean;
}

export interface ApplyDeps {
  readonly repository: CostRepositoryPort;
  readonly provider: CloudProviderPort;
}

export interface ApplyReadError {
  readonly kind: 'read-error';
  readonly ref: string;
  readonly error: unknown;
}

/** No inventory in scope has an `asOf` matching the plan's baseline — re-stocktake and re-plan. */
export interface ApplyNoBaseline {
  readonly kind: 'no-baseline';
  readonly message: string;
}

/** More than one inventory shares the plan's baseline `asOf` — ambiguous, so nothing is applied. */
export interface ApplyMultipleBaseline {
  readonly kind: 'multiple-baseline';
  readonly message: string;
  readonly refs: readonly string[];
}

/** The provider's live state has drifted from the baseline inventory since the plan was computed. */
export interface ApplyDrift {
  readonly kind: 'drift';
  readonly message: string;
  readonly baselineRef: string;
  readonly drifts: readonly Drift[];
}

export interface ApplyOk {
  readonly kind: 'ok';
  readonly dryRun: boolean;
  readonly result: ApplyResult;
  /** `resourceId -> display name`, from the baseline inventory — handy for a human-readable rendering. */
  readonly nameById: Readonly<Record<string, string>>;
}

export type ApplyOutcome = ApplyReadError | ApplyNoBaseline | ApplyMultipleBaseline | ApplyDrift | ApplyOk;

/**
 * Applies (or dry-runs) `params.planRef` against `deps.provider`, after
 * locating and drift-verifying its baseline inventory in `deps.repository`.
 */
export async function computeApply(deps: ApplyDeps, params: ApplyParams): Promise<ApplyOutcome> {
  let plan: TagPlan;
  try {
    plan = await deps.repository.readTagPlan(params.planRef);
  } catch (error) {
    return { kind: 'read-error', ref: params.planRef, error };
  }

  const invRefs = await deps.repository.listInventories();
  // Collect EVERY inventory whose asOf string-equals the plan's baseline —
  // not just the first by sorted ref. With two (or more) inventories sharing
  // that asOf, silently picking the first can gate against the wrong one in
  // either direction (a stale "in sync" pass, or a spurious drift refusal).
  const matches: { ref: string; inventory: Inventory }[] = [];
  for (const { ref } of invRefs) {
    try {
      const candidate = await deps.repository.readInventory(ref);
      if (candidate.spec.asOf === plan.spec.baselineAsOf) {
        matches.push({ ref, inventory: candidate });
      }
    } catch {
      // An unrelated invalid inventory doesn't block finding the right one.
    }
  }
  if (matches.length === 0) {
    return {
      kind: 'no-baseline',
      message: `no inventory found with asOf matching the plan's baseline (${plan.spec.baselineAsOf}) — re-stocktake and re-plan`,
    };
  }
  if (matches.length > 1) {
    const refs = matches.map((m) => m.ref);
    return {
      kind: 'multiple-baseline',
      message: `${matches.length} inventories share the plan's baselineAsOf (${plan.spec.baselineAsOf}): ${refs.join(', ')}; keep exactly one or re-plan`,
      refs,
    };
  }
  const onlyMatch = matches[0];
  if (onlyMatch === undefined) {
    // Unreachable given the length checks above; keeps this function total.
    return { kind: 'no-baseline', message: 'internal error resolving baseline inventory' };
  }
  const baseline = onlyMatch.inventory;
  const baselineRef = onlyMatch.ref;

  const plannedResourceIds = [...new Set(plan.spec.entries.map((e) => e.resourceId))].sort(compareResourceIds);
  const driftReport = await deps.provider.verifyBaseline(baseline, plannedResourceIds);
  if (!driftReport.inSync) {
    return {
      kind: 'drift',
      message: `live state has drifted from the plan's baseline inventory (${baselineRef})`,
      baselineRef,
      drifts: driftReport.drifts,
    };
  }

  const result = await deps.provider.applyTags(plan, { dryRun: params.dryRun });
  const nameById: Record<string, string> = {};
  for (const resource of baseline.spec.resources) {
    nameById[resource.id] = resource.name;
  }

  return { kind: 'ok', dryRun: params.dryRun, result, nameById };
}
