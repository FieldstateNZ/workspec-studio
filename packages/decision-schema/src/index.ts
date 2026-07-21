// @workspec/decision-schema — the Zod source of truth for Decision Studio
// artifacts. One definition yields three outputs: TypeScript types (`z.infer`),
// runtime validation (`safeParse`), and JSON Schema (draft 2020-12) for editor
// IntelliSense. Built on `@workspec/schema-core`'s K8s-style envelope
// (`defineArtifact`) — see `docs/decisions/workspec-decision-schema-v0.1.md`
// for the spec.

/**
 * This package's own identity. A few consumers import this constant as a
 * smoke test of the wiring, matching the pattern in `@workspec/cost-schema`.
 */
export const DECISION_SCHEMA_PACKAGE = '@workspec/decision-schema' as const;

// ── Version, URL and directive constants. `SCHEMA_VERSION`/`API_VERSION`/
// `SCHEMA_BASE_URL`/`JSON_SCHEMA_DIALECT`/`schemaDirective` are
// `@workspec/schema-core`'s (re-exported here, values unchanged from this
// package's former local copies); the two `*_SCHEMA_URL`/`*_SCHEMA_DIRECTIVE`
// constants are this package's own. ────────────────────────────────────────
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
} from './constants.js';

// ── Kind list and type directories (decision-schema's own two kinds) ───────
export { ARTIFACT_KINDS } from './paths/artifact-kind.js';
export type { ArtifactKind } from './paths/artifact-kind.js';
export { TYPE_DIRECTORIES, typeDirectoryFor } from './paths/type-directories.js';

// ── Shared primitives ───────────────────────────────────────────────────────
export { identifier } from './common.js';

// ── Catalog artifact: schemas + inferred types ──────────────────────────────
export { PricingMode, Schedule, Sku, CatalogSpec, CatalogArtifact } from './catalog.js';
export type {
  PricingMode as PricingModeType,
  Schedule as ScheduleType,
  Sku as SkuType,
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
