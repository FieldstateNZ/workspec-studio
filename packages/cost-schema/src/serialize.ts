import { stringify } from 'yaml';
import {
  INVENTORY_SCHEMA_URL,
  SPEND_SCHEMA_URL,
  ATTRIBUTION_SCHEMA_URL,
  TAGPLAN_SCHEMA_URL,
  schemaDirective,
} from './constants.js';
import { compareResourceIds } from './inventory.js';
import type { Inventory, InventoryResource } from './inventory.js';
import { compareSpendRows } from './spend.js';
import type { Spend, SpendRow } from './spend.js';
import type { Attribution, Dimension, Rule, RuleMatch, Override } from './attribution.js';
import { compareTagPlanEntries } from './tagplan.js';
import type { TagPlan, TagPlanEntry } from './tagplan.js';

// Byte-stable YAML serialization IS the product contract for the cost
// artifacts: two stock-takes (or plans) that differ only in insignificant
// ways — key order, tag order, which order a resource happened to be
// discovered in — must serialize identically, so a plain `git diff` between
// them shows ONLY meaningful drift. Unlike `@workspec/decision-schema` (whose
// serialization lives in decision-studio, since byte-stability is not load-
// bearing there), this package owns serialization: every function below
// (a) sorts arrays that carry a sort-order contract into that order,
// (b) sorts every record/map's keys ascending, and (c) always emits object
// keys in schema declaration order — regardless of the input object's own
// key/array order. `stringify` runs with fixed options so output never
// varies across environments.
//
// `metadata` now only ever carries the optional `slug` (schema-core's
// `MetadataSchema`) — identity is loader-derived from the filename when
// absent. `name` (optional, human-readable) moved to `spec.name` and is
// emitted first within `spec`, mirroring its former prominence in `metadata`.
//
// These serializers do not themselves call into Zod — callers are expected to
// pass already-validated data (e.g. the `data` returned by `parseInventoryYaml`
// et al.), and `spec.parse.superRefine` in each schema module is what rejects
// a file whose sort order doesn't match what a serializer would produce.

const YAML_OPTIONS = { lineWidth: 0 } as const;

function sortedRecord<V>(record: Record<string, V>): Record<string, V> {
  const out: Record<string, V> = {};
  for (const key of Object.keys(record).sort()) {
    const value = record[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function sortedNestedRecord<V>(
  record: Record<string, Record<string, V>>,
): Record<string, Record<string, V>> {
  const out: Record<string, Record<string, V>> = {};
  for (const key of Object.keys(record).sort()) {
    const value = record[key];
    if (value !== undefined) out[key] = sortedRecord(value);
  }
  return out;
}

// ── Inventory ────────────────────────────────────────────────────────────

function canonicalResource(r: InventoryResource): InventoryResource {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    location: r.location,
    resourceGroup: r.resourceGroup,
    subscription: r.subscription,
    ...(r.tags !== undefined ? { tags: sortedRecord(r.tags) } : {}),
  };
}

/** Serialize an inventory as byte-stable YAML: `resources[]` sorted by id, tags sorted by key. */
export function serializeInventoryYaml(inventory: Inventory): string {
  const resources = [...inventory.spec.resources]
    .sort((a, b) => compareResourceIds(a.id, b.id))
    .map(canonicalResource);

  const doc = {
    apiVersion: inventory.apiVersion,
    kind: inventory.kind,
    metadata: {
      ...(inventory.metadata.slug !== undefined ? { slug: inventory.metadata.slug } : {}),
    },
    spec: {
      ...(inventory.spec.name !== undefined ? { name: inventory.spec.name } : {}),
      asOf: inventory.spec.asOf,
      scope: { subscriptions: [...inventory.spec.scope.subscriptions] },
      resources,
    },
  };

  return schemaDirective(INVENTORY_SCHEMA_URL) + stringify(doc, YAML_OPTIONS);
}

// ── Spend ────────────────────────────────────────────────────────────────

function canonicalSpendRow(r: SpendRow): SpendRow {
  return {
    ...(r.resourceId !== undefined ? { resourceId: r.resourceId } : {}),
    amount: r.amount,
    currency: r.currency,
    period: r.period,
    serviceCategory: r.serviceCategory,
    ...(r.unresolved !== undefined ? { unresolved: r.unresolved } : {}),
    ...(r.sourceLabel !== undefined ? { sourceLabel: r.sourceLabel } : {}),
  };
}

/** Serialize a spend record as byte-stable YAML: `rows[]` sorted by the composite sort key. */
export function serializeSpendYaml(spend: Spend): string {
  const rows = [...spend.spec.rows].sort(compareSpendRows).map(canonicalSpendRow);

  const doc = {
    apiVersion: spend.apiVersion,
    kind: spend.kind,
    metadata: {
      ...(spend.metadata.slug !== undefined ? { slug: spend.metadata.slug } : {}),
    },
    spec: {
      ...(spend.spec.name !== undefined ? { name: spend.spec.name } : {}),
      rows,
    },
  };

  return schemaDirective(SPEND_SCHEMA_URL) + stringify(doc, YAML_OPTIONS);
}

// ── Attribution ──────────────────────────────────────────────────────────
// `dimensions[]`, `rules[]` and `overrides[]` carry no sort-order contract —
// `rules[]` order is semantically meaningful (match precedence) — so only
// each element's own key order (and any nested record's key order) is
// canonicalized; array order is preserved as authored.

function canonicalDimension(d: Dimension): Dimension {
  return { id: d.id, label: d.label, values: [...d.values] };
}

function canonicalMatch(m: RuleMatch): RuleMatch {
  return {
    ...(m.resourceType !== undefined ? { resourceType: m.resourceType } : {}),
    ...(m.nameGlob !== undefined ? { nameGlob: m.nameGlob } : {}),
    ...(m.resourceGroup !== undefined ? { resourceGroup: m.resourceGroup } : {}),
    ...(m.subscription !== undefined ? { subscription: m.subscription } : {}),
    ...(m.tagEquals !== undefined
      ? { tagEquals: { name: m.tagEquals.name, value: m.tagEquals.value } }
      : {}),
    ...(m.tagExists !== undefined ? { tagExists: m.tagExists } : {}),
  };
}

function canonicalRule(r: Rule): Rule {
  return {
    id: r.id,
    name: r.name,
    match: canonicalMatch(r.match),
    ...(r.assign !== undefined ? { assign: sortedRecord(r.assign) } : {}),
    ...(r.split !== undefined ? { split: sortedNestedRecord(r.split) } : {}),
    ...(r.fromTag !== undefined ? { fromTag: sortedRecord(r.fromTag) } : {}),
  };
}

function canonicalOverride(o: Override): Override {
  return { resourceId: o.resourceId, assign: sortedRecord(o.assign) };
}

/** Serialize an attribution as byte-stable YAML: record keys sorted; array order preserved. */
export function serializeAttributionYaml(attribution: Attribution): string {
  const doc = {
    apiVersion: attribution.apiVersion,
    kind: attribution.kind,
    metadata: {
      ...(attribution.metadata.slug !== undefined ? { slug: attribution.metadata.slug } : {}),
    },
    spec: {
      ...(attribution.spec.name !== undefined ? { name: attribution.spec.name } : {}),
      dimensions: attribution.spec.dimensions.map(canonicalDimension),
      rules: attribution.spec.rules.map(canonicalRule),
      ...(attribution.spec.overrides !== undefined
        ? { overrides: attribution.spec.overrides.map(canonicalOverride) }
        : {}),
    },
  };

  return schemaDirective(ATTRIBUTION_SCHEMA_URL) + stringify(doc, YAML_OPTIONS);
}

// ── TagPlan ──────────────────────────────────────────────────────────────

function canonicalTagPlanEntry(e: TagPlanEntry): TagPlanEntry {
  return {
    resourceId: e.resourceId,
    tag: e.tag,
    current: e.current,
    desired: e.desired,
    action: e.action,
  };
}

/** Serialize a tag plan as byte-stable YAML: `entries[]` sorted by (resourceId, tag). */
export function serializeTagPlanYaml(tagPlan: TagPlan): string {
  const entries = [...tagPlan.spec.entries].sort(compareTagPlanEntries).map(canonicalTagPlanEntry);

  const doc = {
    apiVersion: tagPlan.apiVersion,
    kind: tagPlan.kind,
    metadata: {
      ...(tagPlan.metadata.slug !== undefined ? { slug: tagPlan.metadata.slug } : {}),
    },
    spec: {
      ...(tagPlan.spec.name !== undefined ? { name: tagPlan.spec.name } : {}),
      baselineAsOf: tagPlan.spec.baselineAsOf,
      tagMapping: sortedRecord(tagPlan.spec.tagMapping),
      entries,
    },
  };

  return schemaDirective(TAGPLAN_SCHEMA_URL) + stringify(doc, YAML_OPTIONS);
}
