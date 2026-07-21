// The `plan` domain core — shared by the CLI's `plan` command (`cli.ts`'s
// `runPlan`, which parses `--map`/`--out` and prints the outcome) and the
// `cost_plan` MCP tool (`mcp-tools/plan-tool.ts`). Owns the "exactly one
// inventory + one attribution in scope, build the default fs-<dimension> tag
// mapping (overridable per dimension), compute the tag plan, refuse an
// empty/unattributable result, and write it" logic end to end.

import { FILE_EXTENSION, Slug, slugFromPath } from '@workspec/schema-core';
import { typeDirectoryFor } from '@workspec/cost-schema';
import type { Attribution, CostRepositoryPort, Inventory, Spend, TagPlan, TagPlanEntryType } from '@workspec/cost-schema';
import { buildTagPlan, resolveAttribution } from '@workspec/cost-engine';
import type { TagMapping } from '@workspec/cost-engine';

/** Inputs a caller has already extracted from its own arg surface. */
export interface PlanParams {
  /** Per-dimension tag overrides, each `"dimensionId=tagName"` (repeatable). */
  readonly map?: readonly string[];
  /** Where to write the plan (default: `.workspec/tagplans/<latest period>.yaml`). */
  readonly out?: string;
}

export interface PlanUsageError {
  readonly kind: 'usage-error';
  readonly message: string;
}

export interface PlanReadError {
  readonly kind: 'read-error';
  readonly ref: string;
  readonly error: unknown;
}

export interface PlanInternalError {
  readonly kind: 'internal-error';
  readonly message: string;
}

/** Nothing in the estate is attributable — the plan would be empty, so it is refused rather than written. */
export interface PlanNothingAttributable {
  readonly kind: 'nothing-attributable';
  readonly message: string;
}

export interface PlanWriteError {
  readonly kind: 'write-error';
  readonly message: string;
  /** The underlying thrown error, for a caller (e.g. the MCP tool) that wants to classify it itself. */
  readonly error: unknown;
}

/** Add/change/remove/noop counts for the computed plan's entries. */
export interface PlanActionCounts {
  readonly add: number;
  readonly change: number;
  readonly remove: number;
  readonly noop: number;
}

export interface PlanOk {
  readonly kind: 'ok';
  readonly outRef: string;
  readonly tagPlan: TagPlan;
  readonly counts: PlanActionCounts;
}

export type PlanOutcome =
  | PlanUsageError
  | PlanReadError
  | PlanInternalError
  | PlanNothingAttributable
  | PlanWriteError
  | PlanOk;

function kebabCase(id: string): string {
  return id
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase();
}

function defaultTagMapping(attribution: Attribution): TagMapping {
  const mapping: TagMapping = {};
  for (const dimension of attribution.spec.dimensions) {
    mapping[dimension.id] = `fs-${kebabCase(dimension.id)}`;
  }
  return mapping;
}

function parseMapArg(raw: string): [string, string] {
  const eq = raw.indexOf('=');
  if (eq <= 0 || eq === raw.length - 1) {
    throw new Error(`invalid --map "${raw}" (expected "dimensionId=tagName")`);
  }
  return [raw.slice(0, eq), raw.slice(eq + 1)];
}

function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

function latestPeriod(spends: readonly Spend[], inventory: Inventory): string {
  const periods = spends.flatMap((s) => s.spec.rows.map((r) => r.period)).sort();
  const latest = periods.at(-1);
  return latest ?? monthOf(inventory.spec.asOf);
}

function countActions(entries: readonly TagPlanEntryType[]): PlanActionCounts {
  const counts = { add: 0, change: 0, remove: 0, noop: 0 };
  for (const entry of entries) {
    counts[entry.action] += 1;
  }
  return counts;
}

/**
 * Computes (and writes) the tag plan needed to converge `repository`'s
 * estate on its attribution. Requires exactly one inventory and one
 * attribution in scope; joins every spend found only to pick a sensible
 * default output period.
 */
export async function computePlan(repository: CostRepositoryPort, params: PlanParams): Promise<PlanOutcome> {
  // Validate the tag plan's slug EARLY — before any repository reads — so a
  // bad --out fails fast with a clean usage error instead of a repository
  // validation rejection surfacing only at the write, at the very end.
  if (params.out !== undefined) {
    const outSlug = slugFromPath(params.out);
    if (outSlug === null) {
      return { kind: 'usage-error', message: `invalid --out "${params.out}": must end in "${FILE_EXTENSION}"` };
    }
    const outSlugCheck = Slug.safeParse(outSlug);
    if (!outSlugCheck.success) {
      return {
        kind: 'usage-error',
        message: `invalid --out "${params.out}": ${outSlugCheck.error.issues[0]?.message ?? 'must be a valid slug'}`,
      };
    }
  }

  const invRefs = await repository.listInventories();
  const attrRefs = await repository.listAttributions();
  if (invRefs.length !== 1) {
    return { kind: 'usage-error', message: `expected exactly 1 inventory, found ${invRefs.length}` };
  }
  if (attrRefs.length !== 1) {
    return { kind: 'usage-error', message: `expected exactly 1 attribution, found ${attrRefs.length}` };
  }
  const invRef = invRefs[0];
  const attrRef = attrRefs[0];
  if (invRef === undefined || attrRef === undefined) {
    return { kind: 'internal-error', message: 'internal error resolving artifact refs' };
  }

  let inventory: Inventory;
  try {
    inventory = await repository.readInventory(invRef.ref);
  } catch (error) {
    return { kind: 'read-error', ref: invRef.ref, error };
  }

  let attribution: Attribution;
  try {
    attribution = await repository.readAttribution(attrRef.ref);
  } catch (error) {
    return { kind: 'read-error', ref: attrRef.ref, error };
  }

  const dimensionIds = new Set(attribution.spec.dimensions.map((d) => d.id));
  const tagMapping = defaultTagMapping(attribution);
  for (const raw of params.map ?? []) {
    let dim: string;
    let tag: string;
    try {
      [dim, tag] = parseMapArg(raw);
    } catch (error) {
      return { kind: 'usage-error', message: (error as Error).message };
    }
    if (!dimensionIds.has(dim)) {
      return { kind: 'usage-error', message: `unknown dimension "${dim}" in --map (not declared in the attribution)` };
    }
    tagMapping[dim] = tag;
  }

  const spendRefs = await repository.listSpends();
  const spends: Spend[] = [];
  for (const { ref } of spendRefs) {
    try {
      spends.push(await repository.readSpend(ref));
    } catch (error) {
      return { kind: 'read-error', ref, error };
    }
  }

  const outRef = params.out ?? `${typeDirectoryFor('TagPlan')}/${latestPeriod(spends, inventory)}${FILE_EXTENSION}`;
  const outSlug = slugFromPath(outRef);
  const tagPlan: TagPlan = buildTagPlan(inventory, attribution, tagMapping, {
    ...(outSlug !== null ? { slug: outSlug } : {}),
  });

  const primaryDimension = attribution.spec.dimensions[0];
  if (tagPlan.spec.entries.length === 0 && primaryDimension !== undefined) {
    const { resolutions } = resolveAttribution(inventory, attribution);
    const anyResolved = resolutions.some((r) => r.assignments[primaryDimension.id] !== undefined);
    if (!anyResolved) {
      return {
        kind: 'nothing-attributable',
        message: 'no resources are attributable (nothing to tag) — check your attribution rules',
      };
    }
  }

  // Backstop: the --out check above should catch every invalid id before we
  // get here, but a repository validation rejection must never escape as an
  // unhandled promise rejection — turn any write failure into a clean
  // outcome instead.
  try {
    await repository.writeTagPlan(outRef, tagPlan);
  } catch (error) {
    return { kind: 'write-error', message: (error as Error).message, error };
  }

  return { kind: 'ok', outRef, tagPlan, counts: countActions(tagPlan.spec.entries) };
}
