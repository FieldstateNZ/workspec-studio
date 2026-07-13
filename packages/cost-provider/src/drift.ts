import type { Drift, DriftReport } from './types.js';

// ── Shared drift-diff core ──────────────────────────────────────────────────
// The pure comparison `verifyBaseline` (see `./port.ts`) is built on. Used by
// this package's own memory double (`./memory.js`) AND — via the dependency
// edge `@workspec/cost-provider-azure` already has on this package — by that
// package's `verify.ts`, so the "what counts as drift" logic is defined once.
// Deliberately provider-agnostic: it operates on plain `{ id, tags }` maps,
// not on anything Azure- or Inventory-artifact-shaped.

/** The minimal shape `computeDriftReport` needs from a resource: its id and current tags. */
export interface DriftableResource {
  id: string;
  tags?: Record<string, string> | undefined;
}

/**
 * Diff two tag sets. Returns `undefined` when they're equal, otherwise a
 * deterministic (sorted-key), human-readable description of what was added,
 * removed, and changed.
 */
function diffTags(
  baselineTags: Record<string, string>,
  liveTags: Record<string, string>,
): string | undefined {
  const keys = [...new Set([...Object.keys(baselineTags), ...Object.keys(liveTags)])].sort();
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  for (const key of keys) {
    const before = baselineTags[key];
    const after = liveTags[key];
    if (before === undefined && after !== undefined) {
      added.push(`${key}=${after}`);
    } else if (before !== undefined && after === undefined) {
      removed.push(`${key}=${before}`);
    } else if (before !== after) {
      changed.push(`${key}: ${before} -> ${after}`);
    }
  }

  if (added.length === 0 && removed.length === 0 && changed.length === 0) {
    return undefined;
  }
  const parts: string[] = [];
  if (added.length > 0) parts.push(`added ${added.join(', ')}`);
  if (removed.length > 0) parts.push(`removed ${removed.join(', ')}`);
  if (changed.length > 0) parts.push(`changed ${changed.join(', ')}`);
  return parts.join('; ');
}

/**
 * Compare `targetIds` against where each id is recorded — in `baseline`, in
 * `live`, both, or neither — producing a {@link DriftReport}. `targetIds` is
 * whatever the caller already resolved (baseline's own resource ids, or a
 * restricted subset); this function does not choose that set itself.
 *
 * An id present in neither map produces no drift entry (nothing to report).
 * `drifts[]` is ordered by `targetIds`' own order; callers that want a
 * deterministic report should pass `targetIds` pre-sorted (both this
 * package's memory double and the Azure adapter's `verify.ts` do).
 */
export function computeDriftReport(
  targetIds: readonly string[],
  baseline: ReadonlyMap<string, DriftableResource>,
  live: ReadonlyMap<string, DriftableResource>,
): DriftReport {
  const drifts: Drift[] = [];

  for (const id of targetIds) {
    const baselineResource = baseline.get(id);
    const liveResource = live.get(id);

    if (baselineResource === undefined && liveResource === undefined) {
      continue;
    } else if (baselineResource !== undefined && liveResource === undefined) {
      drifts.push({
        kind: 'resource-disappeared',
        resourceId: id,
        detail: `resource "${id}" was recorded in the baseline but no longer exists`,
      });
    } else if (baselineResource === undefined && liveResource !== undefined) {
      drifts.push({
        kind: 'resource-appeared',
        resourceId: id,
        detail: `resource "${id}" exists now but was not recorded in the baseline`,
      });
    } else if (baselineResource !== undefined && liveResource !== undefined) {
      const tagDiff = diffTags(baselineResource.tags ?? {}, liveResource.tags ?? {});
      if (tagDiff !== undefined) {
        drifts.push({ kind: 'tags-changed', resourceId: id, detail: tagDiff });
      }
    }
  }

  return { inSync: drifts.length === 0, drifts };
}
