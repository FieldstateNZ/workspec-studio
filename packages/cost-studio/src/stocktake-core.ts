// The `stocktake` domain core — shared by the CLI's `stocktake` command
// (`cli.ts`'s `runStocktake`, which parses flags and prints the outcome) and
// the `cost_stocktake` MCP tool (`mcp-tools/stocktake-tool.ts`, which reads
// its args directly and returns the outcome as JSON). This module owns every
// check and side effect between "flags parsed" and "files written": the
// `--name`/`--period` validation, the drift-against-previous-inventory
// summary, and the provider fetch + repository write. Neither surface
// re-implements any of it.

import { FILE_EXTENSION, Slug } from '@workspec/schema-core';
import { typeDirectoryFor } from '@workspec/cost-schema';
import type { CostRepositoryPort, Inventory, InventoryResourceType, Spend } from '@workspec/cost-schema';
import { computeDriftReport } from '@workspec/cost-provider';
import type { CloudProviderPort, DriftReport, DriftableResource, ProviderScope } from '@workspec/cost-provider';
import { compareResourceIds } from '@workspec/cost-schema';
import { ArtifactValidationError } from './fs-repository.js';

/** Inputs a caller has already extracted from its own arg surface (CLI flags or MCP tool args). */
export interface StocktakeParams {
  /** Subscriptions to include — must be non-empty. */
  readonly subscriptions: readonly string[];
  /** Stable inventory/spend slug (default: `"estate"`). */
  readonly name?: string;
  /** Billing period `"YYYY-MM"` (default: the current month per `clock`). */
  readonly period?: string;
}

/** Dependencies `runStocktakeCore` needs — a repository, a cloud provider, and a clock. */
export interface StocktakeDeps {
  readonly repository: CostRepositoryPort;
  readonly provider: CloudProviderPort;
  readonly clock: () => string;
}

/** How the previous inventory at `inventoryRef` (if any) was found before this run overwrote it. */
export type PreviousInventoryStatus = 'absent' | 'unparseable' | 'parsed';

/** Successful outcome: the refs written, and what happened to any previous inventory. */
export interface StocktakeOk {
  readonly kind: 'ok';
  readonly inventoryRef: string;
  readonly spendRef: string;
  readonly previousStatus: PreviousInventoryStatus;
  /** Present only when `previousStatus === 'parsed'` — the human-readable drift summary line. */
  readonly driftSummary?: string;
}

/** A client-input problem (bad flags/args) — never touches the provider or the repository. */
export interface StocktakeUsageError {
  readonly kind: 'usage-error';
  readonly message: string;
}

/** The provider fetch succeeded but the repository write failed (e.g. a race, disk-full). */
export interface StocktakeWriteError {
  readonly kind: 'write-error';
  readonly message: string;
  /** The underlying thrown error, for a caller (e.g. the MCP tool) that wants to classify it itself. */
  readonly error: unknown;
}

export type StocktakeOutcome = StocktakeOk | StocktakeUsageError | StocktakeWriteError;

function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

function asDriftable(resources: readonly InventoryResourceType[]): ReadonlyMap<string, DriftableResource> {
  return new Map(resources.map((r) => [r.id, r]));
}

function inventoryDrift(oldInventory: Inventory, newInventory: Inventory): DriftReport {
  const oldMap = asDriftable(oldInventory.spec.resources);
  const newMap = asDriftable(newInventory.spec.resources);
  const targetIds = [...new Set([...oldMap.keys(), ...newMap.keys()])].sort(compareResourceIds);
  return computeDriftReport(targetIds, oldMap, newMap);
}

/** Renders a `DriftReport` as the one-line summary `stocktake` has always printed. */
export function driftSummaryText(report: DriftReport): string {
  if (report.inSync) return 'no drift';
  const appeared = report.drifts.filter((d) => d.kind === 'resource-appeared').length;
  const disappeared = report.drifts.filter((d) => d.kind === 'resource-disappeared').length;
  const tagsChanged = report.drifts.filter((d) => d.kind === 'tags-changed').length;
  const total = report.drifts.length;
  const word = total === 1 ? 'drift' : 'drifts';
  return `${total} ${word}: +${appeared} appeared · −${disappeared} disappeared · ~${tagsChanged} tags changed`;
}

/**
 * Runs a stocktake: validates `params`, fetches the estate + spend from
 * `deps.provider`, diffs against any previous inventory at the same stable
 * ref, and writes both artifacts. Never throws for an expected failure
 * (usage or write) — every path resolves to a {@link StocktakeOutcome}.
 */
export async function runStocktakeCore(
  params: StocktakeParams,
  deps: StocktakeDeps,
): Promise<StocktakeOutcome> {
  if (params.subscriptions.length === 0) {
    return { kind: 'usage-error', message: 'at least one --subscription is required' };
  }
  if (params.period !== undefined && !/^\d{4}-(0[1-9]|1[0-2])$/.test(params.period)) {
    return {
      kind: 'usage-error',
      message: `--period must be an ISO month "YYYY-MM", got "${params.period}"`,
    };
  }

  const name = params.name ?? 'estate';
  // Validate the slug EARLY — before touching the provider at all — so a bad
  // name fails fast with a clean usage error instead of paying for a
  // provider round-trip only to have the write reject at the very end.
  const nameCheck = Slug.safeParse(name);
  if (!nameCheck.success) {
    return {
      kind: 'usage-error',
      message: `invalid --name "${name}": ${nameCheck.error.issues[0]?.message ?? 'must be a valid slug'}`,
    };
  }

  const period = params.period ?? monthOf(deps.clock());
  const scope: ProviderScope = { subscriptions: [...params.subscriptions] };

  const inventoryRef = `${typeDirectoryFor('Inventory')}/${name}${FILE_EXTENSION}`;
  const spendSlug = `${name}-${period}`;
  const spendRef = `${typeDirectoryFor('Spend')}/${spendSlug}${FILE_EXTENSION}`;

  let oldInventory: Inventory | undefined;
  let previousStatus: PreviousInventoryStatus = 'absent';
  try {
    oldInventory = await deps.repository.readInventory(inventoryRef);
    previousStatus = 'parsed';
  } catch (error) {
    oldInventory = undefined;
    previousStatus = error instanceof ArtifactValidationError ? 'unparseable' : 'absent';
  }

  const fetchedInventory = await deps.provider.fetchInventory(scope);
  const newInventory: Inventory = { ...fetchedInventory, metadata: { slug: name } };

  const fetchedSpend = await deps.provider.fetchSpend(scope, period);
  const newSpend: Spend = { ...fetchedSpend, metadata: { slug: spendSlug } };

  const driftSummary =
    oldInventory !== undefined ? driftSummaryText(inventoryDrift(oldInventory, newInventory)) : undefined;

  // Backstop: the name check above should catch every invalid --name before
  // we get here, but a repository validation rejection must never escape as
  // an unhandled promise rejection — turn any write failure into a clean
  // outcome instead.
  try {
    await deps.repository.writeInventory(inventoryRef, newInventory);
    await deps.repository.writeSpend(spendRef, newSpend);
  } catch (error) {
    return { kind: 'write-error', message: (error as Error).message, error };
  }

  return {
    kind: 'ok',
    inventoryRef,
    spendRef,
    previousStatus,
    ...(driftSummary !== undefined ? { driftSummary } : {}),
  };
}
