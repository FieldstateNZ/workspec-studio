// @workspec/decision-schema — the Zod source of truth for Decision Studio
// artifacts. One definition yields three outputs: TypeScript types (`z.infer`),
// runtime validation (`safeParse`), and JSON Schema (draft 2020-12) for editor
// IntelliSense. See `docs/workspec-decision-schema-v0.1.md` for the spec.

// ── Version, URLs, directives and file-naming constants ─────────────────────
export {
  SCHEMA_VERSION,
  API_VERSION,
  SCHEMA_BASE_URL,
  DECISION_SCHEMA_URL,
  CATALOG_SCHEMA_URL,
  JSON_SCHEMA_DIALECT,
  schemaDirective,
  DECISION_SCHEMA_DIRECTIVE,
  CATALOG_SCHEMA_DIRECTIVE,
  DECISION_FILE_SUFFIX,
  CATALOG_FILE_SUFFIX,
  DECISION_FILE_GLOB,
  CATALOG_FILE_GLOB,
  DECISION_FILE_GLOB_RECURSIVE,
  CATALOG_FILE_GLOB_RECURSIVE,
  isDecisionFile,
  isCatalogFile,
} from './constants.js';

// ── Shared primitives ───────────────────────────────────────────────────────
export { identifier } from './common.js';

// ── Catalog artifact: schemas + inferred types ──────────────────────────────
export {
  PricingMode,
  Schedule,
  Sku,
  CatalogMetadata,
  CatalogSpec,
  CatalogArtifact,
} from './catalog.js';
export type {
  PricingMode as PricingModeType,
  Schedule as ScheduleType,
  Sku as SkuType,
  CatalogMetadata as CatalogMetadataType,
  CatalogSpec as CatalogSpecType,
  Catalog,
} from './catalog.js';

// ── Decision artifact: schemas + inferred types ─────────────────────────────
export {
  SkuLine,
  FlatLine,
  Line,
  PatchMatch,
  PatchSet,
  PatchOp,
  Lever,
  OptionScore,
  Option,
  Criterion,
  Outcome,
  Link,
  DecisionMetadata,
  DecisionSpec,
  DecisionArtifact,
} from './decision.js';
export type {
  SkuLine as SkuLineType,
  FlatLine as FlatLineType,
  Line as LineType,
  PatchMatch as PatchMatchType,
  PatchSet as PatchSetType,
  PatchOp as PatchOpType,
  Lever as LeverType,
  OptionScore as OptionScoreType,
  Option as OptionType,
  Criterion as CriterionType,
  Outcome as OutcomeType,
  Link as LinkType,
  DecisionMetadata as DecisionMetadataType,
  DecisionSpec as DecisionSpecType,
  Decision,
} from './decision.js';

// ── YAML load helpers (parse + validate + line/col error mapping) ───────────
export { parseDecisionYaml, parseCatalogYaml } from './yaml.js';
export type { ParseIssue, ParseResult } from './yaml.js';

// ── Repository port + in-memory test double (S3) ────────────────────────────
export { createMemoryRepository, DECISION_REPOSITORY_METHODS } from './repository.js';
export type {
  DecisionRepositoryPort,
  DecisionRef,
  CatalogRef,
  Ref,
  MemoryRepositorySeed,
} from './repository.js';

// ── JSON Schema generation ──────────────────────────────────────────────────
export {
  buildDecisionJsonSchema,
  buildCatalogJsonSchema,
  buildAllJsonSchemas,
  serializeJsonSchema,
} from './json-schema.js';
