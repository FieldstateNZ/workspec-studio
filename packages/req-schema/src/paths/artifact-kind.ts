/**
 * The traceability artifact kinds `@workspec/req-schema` owns a type directory
 * for. The shared `Actor` kind is deliberately absent: it is owned (kind,
 * directory, and JSON Schema) by `@workspec/schema-core` and re-exported from
 * this package's index for convenience — so it does not appear in this list or
 * in `TYPE_DIRECTORIES`. This list only covers the three kinds req-schema
 * itself defines.
 */
export const ARTIFACT_KINDS = ['Feature', 'UserRequirement', 'SystemRequirement'] as const;

/** One of the traceability artifact kinds req-schema owns a type directory for. */
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];
