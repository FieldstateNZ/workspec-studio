export { SCHEMA_VERSION, SCHEMA_BASE_URL, JSON_SCHEMA_DIALECT } from './constants/schema-version.js';
export {
  schemaUrlFor,
  ACTOR_SCHEMA_URL,
  SYSTEM_SCHEMA_URL,
  EXTERNAL_SYSTEM_SCHEMA_URL,
  CONTAINER_SCHEMA_URL,
  COMPONENT_SCHEMA_URL,
  DATABASE_SCHEMA_URL,
  QUEUE_SCHEMA_URL,
  DOMAIN_SCHEMA_URL,
  FEATURE_SCHEMA_URL,
  DIAGRAM_SCHEMA_URL,
  LAYOUT_SCHEMA_URL,
  SPEC_SCHEMA_URL,
} from './constants/schema-urls.js';
export {
  schemaDirective,
  ACTOR_SCHEMA_DIRECTIVE,
  SYSTEM_SCHEMA_DIRECTIVE,
  EXTERNAL_SYSTEM_SCHEMA_DIRECTIVE,
  CONTAINER_SCHEMA_DIRECTIVE,
  COMPONENT_SCHEMA_DIRECTIVE,
  DATABASE_SCHEMA_DIRECTIVE,
  QUEUE_SCHEMA_DIRECTIVE,
  DOMAIN_SCHEMA_DIRECTIVE,
  FEATURE_SCHEMA_DIRECTIVE,
  DIAGRAM_SCHEMA_DIRECTIVE,
  LAYOUT_SCHEMA_DIRECTIVE,
  SPEC_SCHEMA_DIRECTIVE,
} from './constants/schema-directives.js';

export { WORKSPEC_DIR } from './paths/workspec-dir.js';
export { FILE_EXTENSION } from './paths/file-extension.js';
export { ARTIFACT_KINDS } from './paths/artifact-kind.js';
export type { ArtifactKind } from './paths/artifact-kind.js';
export { TYPE_DIRECTORIES } from './paths/type-directories.js';
export { slugify } from './paths/slugify.js';
export { artifactPathFor } from './paths/artifact-path-for.js';
export { slugFromPath } from './paths/slug-from-path.js';
export { layoutPathFor } from './paths/layout-path-for.js';
export { isLayoutFile } from './paths/is-layout-file.js';

export { linksField } from './schemas/common/links-field.js';
export type { LinksField } from './schemas/common/links-field.js';
export { LinkCardinality, CARDINALITY_VALUES } from './schemas/common/link-cardinality.js';
export { sourceField } from './schemas/common/source-field.js';
export type { SourceField } from './schemas/common/source-field.js';
export { PATH_REF_PATTERN } from './schemas/common/path-ref-pattern.js';

export { ActorElement } from './schemas/actor.js';
export { ExternalSystemElement } from './schemas/external-system.js';
export { SystemElement, SYSTEM_PHASES } from './schemas/system.js';
export { DomainElement } from './schemas/domain.js';
export { FeatureElement } from './schemas/feature.js';
export { C4Element } from './schemas/c4-element.js';

export { C4_REF_KINDS } from './schemas/diagram/c4-ref-kinds.js';
export type { C4RefKind } from './schemas/diagram/c4-ref-kinds.js';
export { SYSTEM_ALIAS } from './schemas/diagram/system-alias.js';
export { DiagramPosition } from './schemas/diagram/diagram-position.js';
export { ThinDiagramNode } from './schemas/diagram/diagram-node-thin.js';
export { DiagramEdge, DIAGRAM_EDGE_LENSES } from './schemas/diagram/diagram-edge.js';
export { ThinDiagram } from './schemas/diagram/diagram-thin.js';
export { FatDiagramNode } from './schemas/diagram/diagram-node-fat.js';
export { DiagramTagStyle } from './schemas/diagram/diagram-tag-style.js';
export { FatDiagram } from './schemas/diagram/diagram-fat.js';
export { Diagram } from './schemas/diagram/diagram.js';

export { StyleElement, STYLE_SHAPES, STYLE_ELEMENT_VARIANTS } from './schemas/spec/style-element.js';
export { StyleConnection, STYLE_CONNECTION_STYLES } from './schemas/spec/style-connection.js';
export { StyleSurfaceSet } from './schemas/spec/style-surface-set.js';
export { Spec } from './schemas/spec/spec.js';

export { LayoutNode } from './schemas/layout/layout-node.js';
export { LayoutEdge, LayoutWaypoint } from './schemas/layout/layout-edge.js';
export { LayoutViewport } from './schemas/layout/layout-viewport.js';
export { Layout } from './schemas/layout/layout.js';

export type { ParseIssue, ParseResult } from './yaml/parse-result.types.js';
export { parseYamlArtifact } from './yaml/parse-core.js';
export { locateYamlPath } from './yaml/locate-yaml-path.js';
export type { YamlPosition } from './yaml/locate-yaml-path.js';
export { parseActorYaml } from './yaml/parse-actor-yaml.js';
export { parseExternalSystemYaml } from './yaml/parse-external-system-yaml.js';
export { parseSystemYaml } from './yaml/parse-system-yaml.js';
export { parseDomainYaml } from './yaml/parse-domain-yaml.js';
export { parseFeatureYaml } from './yaml/parse-feature-yaml.js';
export { parseContainerYaml } from './yaml/parse-container-yaml.js';
export { parseComponentYaml } from './yaml/parse-component-yaml.js';
export { parseDatabaseYaml } from './yaml/parse-database-yaml.js';
export { parseQueueYaml } from './yaml/parse-queue-yaml.js';
export { parseDiagramYaml } from './yaml/parse-diagram-yaml.js';
export { parseSpecYaml } from './yaml/parse-spec-yaml.js';
export { parseLayoutYaml } from './yaml/parse-layout-yaml.js';
export { serializeLayout } from './yaml/serialize-layout.js';

export { buildJsonSchema } from './json-schema/build-json-schema.js';
export { buildAllJsonSchemas } from './json-schema/build-all-json-schemas.js';
export { serializeJsonSchema } from './json-schema/serialize-json-schema.js';
export { sortJsonKeys } from './json-schema/sort-json-keys.js';
