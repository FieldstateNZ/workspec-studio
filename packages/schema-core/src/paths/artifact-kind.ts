/**
 * The shared artifact kinds this package owns a type directory for. This is
 * deliberately narrow today (`Actor` is the only kind schema-core defines) —
 * per-family packages (c4-schema, req-schema, …) own their own kinds and
 * type directories; this list only grows as more kinds become genuinely
 * shared across families.
 */
export const ARTIFACT_KINDS = ['Actor'] as const;

/** One of the shared artifact kinds schema-core owns a type directory for. */
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];
