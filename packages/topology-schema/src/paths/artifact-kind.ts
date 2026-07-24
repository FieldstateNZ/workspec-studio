/**
 * The Topology Studio artifact kinds `@workspec/topology-schema` owns a type
 * directory for. Mirrors `@workspec/decision-schema`'s `ARTIFACT_KINDS`
 * shape. `layout` is deliberately absent: a topology's `.layout/` file is a
 * special, unregistered file (mirroring `@workspec/c4-schema`'s treatment of
 * diagram layouts), not a fourth artifact kind — see `layout-path-for.ts`.
 */
export const ARTIFACT_KINDS = ['Topology', 'Resource', 'Environment'] as const;

/** One of the Topology Studio artifact kinds topology-schema owns a type directory for. */
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];
