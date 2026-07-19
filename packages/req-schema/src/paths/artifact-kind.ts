/**
 * The traceability artifact kinds `@workspec/req-schema` owns a type directory
 * for. The shared `Actor` kind is deliberately absent: it is owned (kind,
 * directory, and JSON Schema) by `@workspec/schema-core` and re-exported from
 * this package's index for convenience — so it does not appear in this list or
 * in `TYPE_DIRECTORIES`. This list only covers the four kinds req-schema
 * itself defines: `Feature`, `UserRequirement`, `SystemRequirement` (a Gherkin
 * Rule, spec §4.4), and `Scenario` (the executed unit, spec §4.5).
 */
export const ARTIFACT_KINDS = [
  'Feature',
  'UserRequirement',
  'SystemRequirement',
  'Scenario',
] as const;

/** One of the traceability artifact kinds req-schema owns a type directory for. */
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];
