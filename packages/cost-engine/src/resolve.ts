// The resolution cascade: per-dimension first-set-wins over ordered rules,
// then overrides (which unconditionally beat all rules). See the README for
// the full normative semantics; this module is the reference implementation.

import type {
  Attribution,
  Inventory,
  InventoryResourceType,
  OverrideType,
  RuleType,
} from '@workspec/cost-schema';
import { matchRule } from './match.js';
import { UNATTRIBUTED } from './rollup.js';
import type {
  Diagnostic,
  DimensionAssignment,
  OverrideTraceEntry,
  ResolveAttributionResult,
  ResourceResolution,
  RuleStat,
  RuleTraceEntry,
  ShadowedDimension,
} from './types.js';

interface MutableRuleStat {
  matched: number;
  won: number;
}

function dimensionRank(dimensionId: string, order: ReadonlyMap<string, number>): number {
  return order.get(dimensionId) ?? Number.MAX_SAFE_INTEGER;
}

/** Record `value` on `dimensionId` if unassigned, else record a shadow. Returns true if taken. */
function takeOrShadow(
  dimensionId: string,
  assign: (dimensionId: string) => DimensionAssignment,
  assignments: Record<string, DimensionAssignment>,
  took: string[],
  shadowed: ShadowedDimension[],
): boolean {
  const existing = assignments[dimensionId];
  if (existing === undefined) {
    assignments[dimensionId] = assign(dimensionId);
    took.push(dimensionId);
    return true;
  }
  shadowed.push({ dimensionId, winnerRuleId: existing.provenance });
  return false;
}

/**
 * `'unattributed'` is reserved: it's the sentinel bucket/cell key rollups and
 * cross-tabs use for a resource unresolved on a dimension (see rollup.ts). If
 * a resource's resolved value on a dimension is literally `'unattributed'` —
 * whether declared and assigned/split like any other value, read dynamically
 * via `fromTag`, or pinned by an override — nothing in the schema forbids it,
 * so the engine still assigns it, but that resolved value now collides with
 * the sentinel: rollups/cross-tabs can no longer distinguish it from a
 * resource that was never resolved on that dimension, even though `coverage`
 * correctly counts it as attributed. Warn so callers can catch this.
 */
function warnIfReserved(
  value: string,
  resourceId: string,
  dimensionId: string,
  diagnostics: Diagnostic[],
): void {
  if (value !== UNATTRIBUTED) return;
  diagnostics.push({
    code: 'reserved-dimension-value',
    severity: 'warning',
    message:
      `resource "${resourceId}" resolved dimension "${dimensionId}" to the reserved value ` +
      `"${UNATTRIBUTED}", which collides with the sentinel bucket rollups/cross-tabs use for ` +
      'resources unresolved on that dimension',
    resourceId,
    dimensionId,
  });
}

function resolveOneResource(
  resource: InventoryResourceType,
  rules: readonly RuleType[],
  override: OverrideType | undefined,
  dimensionOrder: ReadonlyMap<string, number>,
  dimensionValues: ReadonlyMap<string, ReadonlySet<string>>,
  ruleStats: ReadonlyMap<string, MutableRuleStat>,
  diagnostics: Diagnostic[],
): ResourceResolution {
  const assignments: Record<string, DimensionAssignment> = {};
  const trace: RuleTraceEntry[] = [];
  let didNotMatchCount = 0;

  for (const rule of rules) {
    if (!matchRule(rule, resource)) {
      didNotMatchCount++;
      continue;
    }
    const stat = ruleStats.get(rule.id);
    if (stat !== undefined) stat.matched++;

    const took: string[] = [];
    const shadowed: ShadowedDimension[] = [];

    if (rule.assign !== undefined) {
      for (const [dimensionId, value] of Object.entries(rule.assign)) {
        const didTake = takeOrShadow(
          dimensionId,
          () => ({ kind: 'value', value, provenance: rule.id }),
          assignments,
          took,
          shadowed,
        );
        if (didTake) warnIfReserved(value, resource.id, dimensionId, diagnostics);
      }
    }

    if (rule.split !== undefined) {
      for (const [dimensionId, ratios] of Object.entries(rule.split)) {
        const didTake = takeOrShadow(
          dimensionId,
          () => ({
            kind: 'split',
            parts: Object.entries(ratios).map(([value, ratio]) => ({ value, ratio })),
            provenance: rule.id,
          }),
          assignments,
          took,
          shadowed,
        );
        if (didTake) {
          for (const value of Object.keys(ratios)) warnIfReserved(value, resource.id, dimensionId, diagnostics);
        }
      }
    }

    if (rule.fromTag !== undefined) {
      for (const [dimensionId, tagKey] of Object.entries(rule.fromTag)) {
        const tagValue = resource.tags?.[tagKey];
        // The tag is absent: this effect simply does not fire for this
        // resource — it neither takes nor shadows the dimension.
        if (tagValue === undefined) continue;

        const alreadyAssigned = assignments[dimensionId] !== undefined;
        takeOrShadow(
          dimensionId,
          () => ({ kind: 'value', value: tagValue, provenance: rule.id }),
          assignments,
          took,
          shadowed,
        );
        if (!alreadyAssigned) {
          const declared = dimensionValues.get(dimensionId);
          if (declared !== undefined && !declared.has(tagValue)) {
            diagnostics.push({
              code: 'unknown-dimension-value',
              severity: 'warning',
              message:
                `rule "${rule.id}" assigned dimension "${dimensionId}" the value "${tagValue}" ` +
                `(read from tag "${tagKey}"), which is not declared on that dimension`,
              ruleId: rule.id,
              resourceId: resource.id,
              dimensionId,
            });
          }
          warnIfReserved(tagValue, resource.id, dimensionId, diagnostics);
        }
      }
    }

    if (took.length > 0 && stat !== undefined) stat.won++;

    took.sort((a, b) => dimensionRank(a, dimensionOrder) - dimensionRank(b, dimensionOrder));
    shadowed.sort(
      (a, b) => dimensionRank(a.dimensionId, dimensionOrder) - dimensionRank(b.dimensionId, dimensionOrder),
    );
    trace.push({ ruleId: rule.id, tookDimensions: took, shadowed });
  }

  let overrideTrace: OverrideTraceEntry | undefined;
  if (override !== undefined) {
    const entries = Object.entries(override.assign);
    for (const [dimensionId, value] of entries) {
      // Overrides unconditionally overwrite — even a dimension a rule already won.
      assignments[dimensionId] = { kind: 'value', value, provenance: 'override' };
      warnIfReserved(value, resource.id, dimensionId, diagnostics);
    }
    const tookDimensions = entries
      .map(([dimensionId]) => dimensionId)
      .sort((a, b) => dimensionRank(a, dimensionOrder) - dimensionRank(b, dimensionOrder));
    overrideTrace = { tookDimensions };
  }

  return {
    resourceId: resource.id,
    assignments,
    trace,
    didNotMatchCount,
    ...(overrideTrace !== undefined ? { overrideTrace } : {}),
  };
}

/**
 * Resolve every inventory resource against the attribution ruleset: rules
 * evaluated in array order (order is precedence), per-dimension first-set-
 * wins, then pinned overrides unconditionally overwrite. Returns one
 * resolution per inventory resource (inventory order), per-rule match/win
 * stats, and resolution-time diagnostics (`rule-never-matched`,
 * `rule-never-won`, `unknown-dimension-value`, `override-unknown-resource`,
 * `reserved-dimension-value`).
 *
 * Pure: never mutates `inventory` or `attribution`. This module has no
 * concept of "disabled" rules — a caller wanting to simulate disabling a
 * rule (e.g. a UI toggle) filters `attribution.spec.rules` before calling.
 */
export function resolveAttribution(inventory: Inventory, attribution: Attribution): ResolveAttributionResult {
  const dimensions = attribution.spec.dimensions;
  const dimensionOrder = new Map<string, number>(dimensions.map((d, i) => [d.id, i]));
  const dimensionValues = new Map<string, ReadonlySet<string>>(
    dimensions.map((d) => [d.id, new Set(d.values)]),
  );
  const rules = attribution.spec.rules;
  const overrides = attribution.spec.overrides ?? [];

  const ruleStats = new Map<string, MutableRuleStat>(rules.map((r) => [r.id, { matched: 0, won: 0 }]));
  const diagnostics: Diagnostic[] = [];

  const overrideByResourceId = new Map<string, OverrideType>();
  const inventoryIds = new Set(inventory.spec.resources.map((r) => r.id));
  for (const override of overrides) {
    overrideByResourceId.set(override.resourceId, override);
    if (!inventoryIds.has(override.resourceId)) {
      diagnostics.push({
        code: 'override-unknown-resource',
        severity: 'warning',
        message: `override targets unknown resource id "${override.resourceId}" (not in inventory)`,
        resourceId: override.resourceId,
      });
    }
  }

  const resolutions: ResourceResolution[] = inventory.spec.resources.map((resource) =>
    resolveOneResource(
      resource,
      rules,
      overrideByResourceId.get(resource.id),
      dimensionOrder,
      dimensionValues,
      ruleStats,
      diagnostics,
    ),
  );

  for (const rule of rules) {
    const stat = ruleStats.get(rule.id);
    if (stat === undefined) continue;
    if (stat.matched === 0) {
      diagnostics.push({
        code: 'rule-never-matched',
        severity: 'info',
        message: `rule "${rule.id}" never matched any resource`,
        ruleId: rule.id,
      });
    } else if (stat.won === 0) {
      diagnostics.push({
        code: 'rule-never-won',
        severity: 'info',
        message: `rule "${rule.id}" matched ${stat.matched} resource(s) but never won a dimension`,
        ruleId: rule.id,
      });
    }
  }

  const ruleStatsOut: Record<string, RuleStat> = {};
  for (const [id, s] of ruleStats) ruleStatsOut[id] = { ruleId: id, matched: s.matched, won: s.won };

  return { resolutions, ruleStats: ruleStatsOut, diagnostics };
}
