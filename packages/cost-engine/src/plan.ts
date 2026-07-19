// The tag-plan diff: pure comparison of resolved attribution against a
// resource's current tags. No provider calls — `apply` (a later slice) is
// what actually writes tags.

import { API_VERSION, compareTagPlanEntries } from '@workspec/cost-schema';
import type { Attribution, Inventory, TagPlan, TagPlanEntryType } from '@workspec/cost-schema';
import { resolveAttribution } from './resolve.js';
import type { DimensionAssignment, TagMapping } from './types.js';

/**
 * Serialize a split assignment's parts into the normative tag-value format:
 * parts ordered by ratio DESCENDING then value ASCENDING, joined `value:pct`
 * by `|`, `pct = ratio * 100` with trailing zeros trimmed (`0.6` → `"60"`,
 * `0.335` → `"33.5"`).
 */
export function serializeSplitValue(parts: readonly { value: string; ratio: number }[]): string {
  const sorted = [...parts].sort((a, b) => {
    if (a.ratio !== b.ratio) return b.ratio - a.ratio;
    return a.value < b.value ? -1 : a.value > b.value ? 1 : 0;
  });
  return sorted.map((part) => `${part.value}:${formatPercent(part.ratio * 100)}`).join('|');
}

/** Round away binary floating-point noise, then trim trailing zeros via plain `Number` → `String`. */
function formatPercent(n: number): string {
  return String(Math.round(n * 1e6) / 1e6);
}

function desiredValue(assignment: DimensionAssignment | undefined): string | null {
  if (assignment === undefined) return null;
  if (assignment.kind === 'value') return assignment.value;
  return serializeSplitValue(assignment.parts);
}

/**
 * Diff resolved attribution against current resource tags.
 *
 * For each inventory resource × each `tagMapping` entry (dimension id → tag
 * name): `desired` is the resolved value for that dimension (a split
 * serializes via `serializeSplitValue`; a `fromTag`-resolved value serializes
 * as the plain value; unresolved ⇒ `null`). `current` is
 * `resource.tags?.[tagName] ?? null`. An entry where BOTH are `null` is
 * omitted entirely. `action` follows the TagPlan schema's consistency rule:
 * `add` (current null), `remove` (desired null), `change` (both set,
 * different), `noop` (equal). Entries are sorted ascending by
 * `(resourceId, tag)`.
 *
 * Pure — no provider calls, no IO. Never mutates `inventory` or `attribution`.
 */
export function plan(inventory: Inventory, attribution: Attribution, tagMapping: TagMapping): TagPlanEntryType[] {
  const { resolutions } = resolveAttribution(inventory, attribution);
  const resolutionByResourceId = new Map(resolutions.map((r) => [r.resourceId, r]));

  const entries: TagPlanEntryType[] = [];
  for (const resource of inventory.spec.resources) {
    const resolution = resolutionByResourceId.get(resource.id);
    for (const [dimensionId, tagName] of Object.entries(tagMapping)) {
      const desired = desiredValue(resolution?.assignments[dimensionId]);
      const current = resource.tags?.[tagName] ?? null;
      if (current === null && desired === null) continue;

      let action: TagPlanEntryType['action'];
      if (current === null) action = 'add';
      else if (desired === null) action = 'remove';
      else if (current === desired) action = 'noop';
      else action = 'change';

      entries.push({ resourceId: resource.id, tag: tagName, current, desired, action });
    }
  }

  return entries.sort(compareTagPlanEntries);
}

/**
 * A complete, schema-shaped `TagPlan` artifact: `plan()`'s entries plus the
 * artifact envelope. `spec.baselineAsOf` is always `inventory.spec.asOf` —
 * the drift-check anchor. `metadata.slug` is optional (identity is normally
 * the loader-derived filename slug assigned when the plan is written); an
 * optional `name` is carried on `spec.name`, not `metadata`.
 */
export function buildTagPlan(
  inventory: Inventory,
  attribution: Attribution,
  tagMapping: TagMapping,
  metadata: { slug?: string; name?: string },
): TagPlan {
  return {
    apiVersion: API_VERSION,
    kind: 'TagPlan',
    metadata: { ...(metadata.slug !== undefined ? { slug: metadata.slug } : {}) },
    spec: {
      ...(metadata.name !== undefined ? { name: metadata.name } : {}),
      baselineAsOf: inventory.spec.asOf,
      tagMapping,
      entries: plan(inventory, attribution, tagMapping),
    },
  };
}
