// Pure formatting/derivation helpers shared by the four views. No React, no
// IO — everything here is a plain function over cost-engine/cost-schema
// shapes, so it is trivially unit-testable and reusable between the rail,
// the table, the cascade, and Reports.

import type { RuleType } from '@workspec/cost-schema';
import type { DimensionAssignment, ResourceResolution, SplitPart } from '@workspec/cost-engine';

/** `1234.5` → `"$1,235"`; negative amounts (credits) render `"-$1,235"`. */
export function formatMoney(amount: number): string {
  const rounded = Math.round(Math.abs(amount));
  const sign = amount < 0 ? '-' : '';
  return `${sign}$${rounded.toLocaleString('en-US')}`;
}

/** `81.23` → `"81.2%"`. Expects a 0–100-scaled number, not a raw ratio. */
export function formatPercent(percent: number): string {
  return `${percent.toFixed(1)}%`;
}

/** A raw `ratio` (unclamped, may be negative or >1) as a 0–100 bar width. */
export function clampPercent(ratio: number): number {
  return Math.max(0, Math.min(100, ratio * 100));
}

/**
 * The rail's per-rule match line. Extends the dossier's three literal forms
 * (`resourceGroup ~ …`, `name ~ …`, `tag … exists`) to the full six-field
 * `RuleMatch` shape the real schema supports; an empty match object is
 * "match: all resources". Multiple present fields join with " · " (AND).
 */
export function matchLineOf(rule: Pick<RuleType, 'match'>): string {
  const m = rule.match;
  const parts: string[] = [];
  if (m.resourceGroup !== undefined) parts.push(`resourceGroup ~ ${m.resourceGroup}`);
  if (m.nameGlob !== undefined) parts.push(`name ~ ${m.nameGlob}`);
  if (m.resourceType !== undefined) parts.push(`type = ${m.resourceType}`);
  if (m.subscription !== undefined) parts.push(`subscription = ${m.subscription}`);
  if (m.tagEquals !== undefined) parts.push(`tag ${m.tagEquals.name} = ${m.tagEquals.value}`);
  if (m.tagExists !== undefined) parts.push(`tag ${m.tagExists} exists`);
  return parts.length === 0 ? 'match: all resources' : parts.join(' · ');
}

/**
 * Dimension/value → accent token. Hardcoded to the demo estate's declared
 * vocabulary (dossier §1.8's `PC` map, translated onto the real
 * `@workspec/design` tokens the mockup's own invented `--el-external`/
 * `--el-component` stood in for — see the C5a report for the mapping).
 * Any other dimension/value pair (a host's own vocabulary) renders neutral.
 */
const PRODUCT_ACCENTS: Readonly<Record<string, string>> = {
  workspec: 'var(--type-feature)',
  atrium: 'var(--type-persona)',
  coffers: 'var(--type-scenario)',
  shared: 'var(--el-external-system)',
};

export function chipAccentFor(dimensionId: string, value: string): string {
  if (dimensionId === 'product') return PRODUCT_ACCENTS[value] ?? 'var(--ink-fade)';
  if (dimensionId === 'costType' && value === 'capex') return 'var(--el-class)';
  return 'var(--ink-fade)';
}

/** The rail's assignment-chip text for one of a rule's effects, plus its accent. */
export interface EffectChip {
  key: string;
  text: string;
  accent: string;
}

export function assignChipsOf(rule: RuleType): EffectChip[] {
  const chips: EffectChip[] = [];
  if (rule.assign) {
    for (const [dimensionId, value] of Object.entries(rule.assign)) {
      chips.push({
        key: `assign:${dimensionId}`,
        text: `${dimensionId} = ${value}`,
        accent: chipAccentFor(dimensionId, value),
      });
    }
  }
  if (rule.split) {
    for (const [dimensionId, ratios] of Object.entries(rule.split)) {
      const pct = Object.values(ratios)
        .map((r) => Math.round(r * 100))
        .join('/');
      chips.push({ key: `split:${dimensionId}`, text: `${dimensionId} split ${pct}`, accent: 'var(--accent)' });
    }
  }
  if (rule.fromTag) {
    for (const [dimensionId, tagKey] of Object.entries(rule.fromTag)) {
      chips.push({
        key: `fromTag:${dimensionId}`,
        text: `${dimensionId} ← tag:${tagKey}`,
        accent: 'var(--ink-fade)',
      });
    }
  }
  return chips;
}

/** The resource table's split-cell label: `"wo 60 / at 40"` (first 2 letters + rounded pct). */
export function splitCellLabel(parts: readonly SplitPart[]): string {
  return parts.map((p) => `${p.value.slice(0, 2)} ${Math.round(p.ratio * 100)}`).join(' / ');
}

/** The inline cascade's value label for a won dimension: a literal value, or `"split 60/40"`. */
export function cascadeValueLabel(assignment: DimensionAssignment): string {
  if (assignment.kind === 'split') {
    return `split ${assignment.parts.map((p) => Math.round(p.ratio * 100)).join('/')}`;
  }
  return assignment.value;
}

/**
 * The next promoted-rule id: `max(existing "r{n}" ids) + 1`, e.g. `r9` after
 * the demo estate's r1–r8, or `r5` after a 4-rule estate's r1–r4. Rules
 * whose id doesn't match the `r{n}` shape are ignored for this computation
 * (a host that names rules some other way still gets a collision-free id,
 * just not necessarily a pretty one — `+ New rule` free-form authoring,
 * where a host might want to, isn't wired up in this slice).
 */
export function nextRuleId(rules: readonly Pick<RuleType, 'id'>[]): string {
  let max = 0;
  for (const rule of rules) {
    const match = /^r(\d+)$/.exec(rule.id);
    if (match) {
      const n = Number(match[1]);
      if (n > max) max = n;
    }
  }
  return `r${max + 1}`;
}

/** Build the promoted rule the composer's "Add as r{n}" button writes. */
export function buildPromotedRule(
  id: string,
  resourceGroup: string,
  primaryDimensionId: string,
  value: string,
): RuleType {
  return {
    id,
    name: `promoted-${resourceGroup}`,
    match: { resourceGroup },
    assign: { [primaryDimensionId]: value },
  };
}

/** One resource-group cluster of resources unresolved on the primary dimension. */
export interface UnattributedCluster {
  resourceGroup: string;
  count: number;
  amount: number;
}

/**
 * Group every resource unresolved on `primaryDimensionId` by resource group
 * — the triage mode's cluster chips (`{rg} · {count} · {$sum}`).
 */
export function computeUnattributedClusters(
  resolutions: readonly ResourceResolution[],
  resourceGroupById: ReadonlyMap<string, string>,
  resourceSpend: Readonly<Record<string, number>>,
  primaryDimensionId: string,
): UnattributedCluster[] {
  const groups = new Map<string, { count: number; amount: number }>();
  for (const resolution of resolutions) {
    if (resolution.assignments[primaryDimensionId] !== undefined) continue;
    const resourceGroup = resourceGroupById.get(resolution.resourceId);
    if (resourceGroup === undefined) continue;
    const existing = groups.get(resourceGroup) ?? { count: 0, amount: 0 };
    existing.count += 1;
    existing.amount += resourceSpend[resolution.resourceId] ?? 0;
    groups.set(resourceGroup, existing);
  }
  return [...groups.entries()].map(([resourceGroup, g]) => ({
    resourceGroup,
    count: g.count,
    amount: g.amount,
  }));
}

/**
 * `"2026-07"` → `"July 2026"`. Reports' header line names the period the
 * spend rows cover; this assumes (as the demo fixture does) a single period
 * across the spend documents given — a multi-period spend set would need a
 * richer picker, out of scope for this slice.
 */
export function formatPeriodLabel(period: string | undefined): string {
  if (!period) return 'this period';
  const parsed = new Date(`${period}-01T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return period;
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(parsed);
}

/** Filter a rule list down to the enabled ones — the caller-side "disabled rule" simulation cost-engine itself has no concept of. */
export function filterEnabledRules(
  rules: readonly RuleType[],
  disabledRuleIds: readonly string[],
): RuleType[] {
  if (disabledRuleIds.length === 0) return [...rules];
  const disabled = new Set(disabledRuleIds);
  return rules.filter((rule) => !disabled.has(rule.id));
}
