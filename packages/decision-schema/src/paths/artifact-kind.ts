/**
 * The Decision Studio artifact kinds `@workspec/decision-schema` owns a type
 * directory for. Mirrors `@workspec/cost-schema`'s `ARTIFACT_KINDS` shape.
 */
export const ARTIFACT_KINDS = ['Decision', 'Catalog'] as const;

/** One of the Decision Studio artifact kinds decision-schema owns a type directory for. */
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];
