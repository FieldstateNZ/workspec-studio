// @workspec/cost-schema — the Zod source of truth for WorkSpec Cost
// Attribution artifacts. One definition yields three outputs: TypeScript
// types (`z.infer`), runtime validation (`safeParse`), and JSON Schema
// (draft 2020-12) for editor IntelliSense. Built on `@workspec/schema-core`'s
// K8s-style envelope (`defineArtifact`) — see the package README for the
// four artifact kinds, their sort-order contracts, and match/effect
// semantics.

/**
 * This package's own identity. Every other `@workspec/cost-*` package
 * depends on this one, directly or transitively — never the reverse — and a
 * few of them import this constant as a smoke test of that wiring.
 */
export const COST_SCHEMA_PACKAGE = '@workspec/cost-schema' as const;

// ── Version, URL and directive constants. `SCHEMA_VERSION`/`API_VERSION`/
// `SCHEMA_BASE_URL`/`JSON_SCHEMA_DIALECT`/`schemaDirective` are
// `@workspec/schema-core`'s (re-exported here, values unchanged from this
// package's former local copies); the four `*_SCHEMA_URL`/`*_SCHEMA_DIRECTIVE`
// constants are this package's own. ────────────────────────────────────────
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
} from './constants.js';

// ── Kind list and type directories (cost-schema's own four kinds) ──────────
export { ARTIFACT_KINDS } from './paths/artifact-kind.js';
export type { ArtifactKind } from './paths/artifact-kind.js';
export { TYPE_DIRECTORIES, typeDirectoryFor } from './paths/type-directories.js';

// ── Shared primitives ───────────────────────────────────────────────────────
export { identifier, resourceTagName, resourceTagValue } from './common.js';

// ── Inventory artifact: schema + inferred types ─────────────────────────────
export {
  InventoryScope,
  InventoryResource,
  InventorySpec,
  InventoryArtifact,
  compareResourceIds,
} from './inventory.js';
export type {
  InventoryScope as InventoryScopeType,
  InventoryResource as InventoryResourceType,
  InventorySpec as InventorySpecType,
  Inventory,
} from './inventory.js';

// ── Spend artifact: schema + inferred types ─────────────────────────────────
export { SpendRow, SpendSpec, SpendArtifact, compareSpendRows } from './spend.js';
export type { SpendRow as SpendRowType, SpendSpec as SpendSpecType, Spend } from './spend.js';

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
  Attribution,
} from './attribution.js';

// ── TagPlan artifact: schema + inferred types ───────────────────────────────
export { TagPlanEntry, TagPlanSpec, TagPlanArtifact, compareTagPlanEntries } from './tagplan.js';
export type {
  TagPlanEntry as TagPlanEntryType,
  TagPlanSpec as TagPlanSpecType,
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

// ── Repository port (storage abstraction) + in-memory test double ──────────
export { COST_REPOSITORY_METHODS, createMemoryRepository } from './repository.js';
export type {
  Ref,
  InventoryRef,
  SpendRef,
  AttributionRef,
  TagPlanRef,
  CostRepositoryPort,
  MemoryRepositorySeed,
} from './repository.js';
