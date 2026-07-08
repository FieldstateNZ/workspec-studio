/**
 * The C4 artifact kinds that own a type directory under `.workspec/` and can
 * therefore be located by `artifactPathFor`. This is narrower than
 * `C4_REF_KINDS`: `class`, `interface`, and `function` are valid diagram
 * node ref kinds but have no backing element schema or directory today
 * (Enterprise conformance note — see the c4-schema README drift log).
 */
export const ARTIFACT_KINDS = [
  'actor',
  'system',
  'external-system',
  'container',
  'component',
  'database',
  'queue',
  'domain',
  'feature',
  'diagram',
] as const;

/** One of the ten artifact kinds that have a type directory. */
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];
