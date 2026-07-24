// @workspec/topology-schema — the Zod source of truth for Topology Studio
// artifacts. One definition yields three outputs: TypeScript types
// (`z.infer`), runtime validation (`safeParse`), and JSON Schema (draft
// 2020-12) for editor IntelliSense. Built on `@workspec/schema-core`'s
// K8s-style envelope (`defineArtifact`), mirroring
// `@workspec/decision-schema`'s package shape.

/**
 * This package's own identity. A few consumers import this constant as a
 * smoke test of the wiring, matching the pattern in
 * `@workspec/decision-schema`.
 */
export const TOPOLOGY_SCHEMA_PACKAGE = '@workspec/topology-schema' as const;

// ── Version, URL and directive constants. `SCHEMA_VERSION`/`API_VERSION`/
// `SCHEMA_BASE_URL`/`JSON_SCHEMA_DIALECT`/`schemaDirective` are
// `@workspec/schema-core`'s (re-exported here); the per-kind `*_SCHEMA_URL`/
// `*_SCHEMA_DIRECTIVE` constants are this package's own. ──────────────────
export {
  SCHEMA_VERSION,
  API_VERSION,
  SCHEMA_BASE_URL,
  TOPOLOGY_SCHEMA_URL,
  RESOURCE_SCHEMA_URL,
  ENVIRONMENT_SCHEMA_URL,
  TOPOLOGY_LAYOUT_SCHEMA_URL,
  JSON_SCHEMA_DIALECT,
  schemaDirective,
  TOPOLOGY_SCHEMA_DIRECTIVE,
  RESOURCE_SCHEMA_DIRECTIVE,
  ENVIRONMENT_SCHEMA_DIRECTIVE,
  TOPOLOGY_LAYOUT_SCHEMA_DIRECTIVE,
} from './constants.js';

// ── Kind list and type directories (topology-schema's own three kinds) ────
export { ARTIFACT_KINDS } from './paths/artifact-kind.js';
export type { ArtifactKind } from './paths/artifact-kind.js';
export { TYPE_DIRECTORIES, typeDirectoryFor } from './paths/type-directories.js';

// ── Layout path helpers (mirrors `@workspec/c4-schema`: a special,
// unregistered file, not a fourth artifact kind) ───────────────────────────
export { layoutPathFor } from './paths/layout-path-for.js';
export { isLayoutFile } from './paths/is-layout-file.js';

// ── Shared primitives ───────────────────────────────────────────────────────
export { Percentage, CostAttribution, ResourceCost, ResourceCostOverride } from './common.js';

// ── Topology artifact: schemas + inferred types ─────────────────────────────
export { Connection, TopologySpec, TopologyArtifact } from './topology.js';
export type {
  Connection as ConnectionType,
  TopologySpec as TopologySpecType,
  Topology,
} from './topology.js';

// ── Resource artifact: schemas + inferred types ──────────────────────────────
export {
  RESOURCE_KINDS,
  ResourceKind,
  ResourceSource,
  ResourceSpec,
  ResourceArtifact,
} from './resource.js';
export type {
  ResourceKind as ResourceKindType,
  ResourceSource as ResourceSourceType,
  ResourceSpec as ResourceSpecType,
  Resource,
} from './resource.js';

// ── Environment artifact: schemas + inferred types ───────────────────────────
export {
  ResourceOverride,
  EnvironmentNaming,
  EnvironmentSpec,
  EnvironmentArtifact,
} from './environment.js';
export type {
  ResourceOverride as ResourceOverrideType,
  EnvironmentNaming as EnvironmentNamingType,
  EnvironmentSpec as EnvironmentSpecType,
  Environment,
} from './environment.js';

// ── Layout: schemas + inferred types (special file, not an artifact kind) ───
export { LayoutRect } from './schemas/layout/layout-rect.js';
export { TopologyLayoutNode } from './schemas/layout/layout-node.js';
export { LayoutWaypoint, LayoutEdge } from './schemas/layout/layout-edge.js';
export { LayoutViewport } from './schemas/layout/layout-viewport.js';
export { Layout } from './schemas/layout/layout.js';
export type { LayoutRect as LayoutRectType } from './schemas/layout/layout-rect.js';
export type { TopologyLayoutNode as TopologyLayoutNodeType } from './schemas/layout/layout-node.js';
export type {
  LayoutWaypoint as LayoutWaypointType,
  LayoutEdge as LayoutEdgeType,
} from './schemas/layout/layout-edge.js';
export type { LayoutViewport as LayoutViewportType } from './schemas/layout/layout-viewport.js';
export type { Layout as LayoutType } from './schemas/layout/layout.js';

// ── YAML load helpers (parse + validate + line/col error mapping) ───────────
export {
  parseTopologyYaml,
  parseResourceYaml,
  parseEnvironmentYaml,
  parseLayoutYaml,
} from './yaml.js';
export type { ParseIssue, ParseResult } from './yaml.js';

// ── Repository port + in-memory test double ─────────────────────────────────
export { createMemoryRepository, TOPOLOGY_REPOSITORY_METHODS } from './repository.js';
export type {
  TopologyRepositoryPort,
  TopologyRef,
  ResourceRef,
  EnvironmentRef,
  Ref,
  MemoryRepositorySeed,
} from './repository.js';

// ── JSON Schema generation ──────────────────────────────────────────────────
export {
  buildTopologyJsonSchema,
  buildResourceJsonSchema,
  buildEnvironmentJsonSchema,
  buildTopologyLayoutJsonSchema,
  buildAllJsonSchemas,
  serializeJsonSchema,
} from './json-schema.js';
