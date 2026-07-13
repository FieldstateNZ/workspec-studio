// @workspec/cost-schema — the Zod source of truth for WorkSpec Cost
// Attribution artifacts. One definition yields three outputs: TypeScript
// types (`z.infer`), runtime validation (`safeParse`), and JSON Schema
// (draft 2020-12) for editor IntelliSense. See the package README for the
// four artifact kinds, their sort-order contracts, and match/effect
// semantics.

/**
 * This package's own identity. Every other `@workspec/cost-*` package
 * depends on this one, directly or transitively — never the reverse — and a
 * few of them import this constant as a smoke test of that wiring.
 */
export const COST_SCHEMA_PACKAGE = '@workspec/cost-schema' as const;

// ── Version, URLs, directives and file-naming constants ─────────────────────
export {
  SCHEMA_VERSION,
  API_VERSION,
  SCHEMA_BASE_URL,
  INVENTORY_SCHEMA_URL,
  SPEND_SCHEMA_URL,
  ATTRIBUTION_SCHEMA_URL,
  TAGPLAN_SCHEMA_URL,
  JSON_SCHEMA_DIALECT,
  schemaDirective,
  INVENTORY_SCHEMA_DIRECTIVE,
  SPEND_SCHEMA_DIRECTIVE,
  ATTRIBUTION_SCHEMA_DIRECTIVE,
  TAGPLAN_SCHEMA_DIRECTIVE,
  INVENTORY_FILE_SUFFIX,
  SPEND_FILE_SUFFIX,
  ATTRIBUTION_FILE_SUFFIX,
  TAGPLAN_FILE_SUFFIX,
  INVENTORY_FILE_GLOB,
  SPEND_FILE_GLOB,
  ATTRIBUTION_FILE_GLOB,
  TAGPLAN_FILE_GLOB,
  INVENTORY_FILE_GLOB_RECURSIVE,
  SPEND_FILE_GLOB_RECURSIVE,
  ATTRIBUTION_FILE_GLOB_RECURSIVE,
  TAGPLAN_FILE_GLOB_RECURSIVE,
  isInventoryFile,
  isSpendFile,
  isAttributionFile,
  isTagPlanFile,
} from './constants.js';

// ── Shared primitives ───────────────────────────────────────────────────────
export { identifier, resourceTagName, resourceTagValue } from './common.js';

// ── Inventory artifact: schema + inferred types ─────────────────────────────
export {
  InventoryScope,
  InventoryResource,
  InventorySpec,
  InventoryMetadata,
  InventoryArtifact,
  compareResourceIds,
} from './inventory.js';
export type {
  InventoryScope as InventoryScopeType,
  InventoryResource as InventoryResourceType,
  InventorySpec as InventorySpecType,
  InventoryMetadata as InventoryMetadataType,
  Inventory,
} from './inventory.js';

// ── Spend artifact: schema + inferred types ─────────────────────────────────
export { SpendRow, SpendSpec, SpendMetadata, SpendArtifact, compareSpendRows } from './spend.js';
export type {
  SpendRow as SpendRowType,
  SpendSpec as SpendSpecType,
  SpendMetadata as SpendMetadataType,
  Spend,
} from './spend.js';

// ── Attribution artifact: schema + inferred types ───────────────────────────
export {
  Dimension,
  RuleMatch,
  RuleAssign,
  RuleSplit,
  RuleFromTag,
  Rule,
  Override,
  AttributionSpec,
  AttributionMetadata,
  AttributionArtifact,
} from './attribution.js';
export type {
  Dimension as DimensionType,
  RuleMatch as RuleMatchType,
  RuleAssign as RuleAssignType,
  RuleSplit as RuleSplitType,
  RuleFromTag as RuleFromTagType,
  Rule as RuleType,
  Override as OverrideType,
  AttributionSpec as AttributionSpecType,
  AttributionMetadata as AttributionMetadataType,
  Attribution,
} from './attribution.js';

// ── TagPlan artifact: schema + inferred types ───────────────────────────────
export {
  TagPlanEntry,
  TagPlanSpec,
  TagPlanMetadata,
  TagPlanArtifact,
  compareTagPlanEntries,
} from './tagplan.js';
export type {
  TagPlanEntry as TagPlanEntryType,
  TagPlanSpec as TagPlanSpecType,
  TagPlanMetadata as TagPlanMetadataType,
  TagPlan,
} from './tagplan.js';

// ── YAML load helpers (parse + validate + line/col error mapping) ───────────
export {
  parseInventoryYaml,
  parseSpendYaml,
  parseAttributionYaml,
  parseTagPlanYaml,
} from './yaml.js';
export type { ParseIssue, ParseResult } from './yaml.js';

// ── Byte-stable YAML serializers (the git-diff-as-drift-report contract) ────
export {
  serializeInventoryYaml,
  serializeSpendYaml,
  serializeAttributionYaml,
  serializeTagPlanYaml,
} from './serialize.js';

// ── JSON Schema generation ──────────────────────────────────────────────────
export {
  buildInventoryJsonSchema,
  buildSpendJsonSchema,
  buildAttributionJsonSchema,
  buildTagPlanJsonSchema,
  buildAllJsonSchemas,
  serializeJsonSchema,
} from './json-schema.js';
