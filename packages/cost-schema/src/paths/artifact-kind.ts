/**
 * The cost-attribution artifact kinds `@workspec/cost-schema` owns a type
 * directory for. Mirrors `@workspec/req-schema`'s `ARTIFACT_KINDS` shape.
 */
export const ARTIFACT_KINDS = ['Inventory', 'Spend', 'Attribution', 'TagPlan'] as const;

/** One of the cost-attribution artifact kinds cost-schema owns a type directory for. */
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];
