/**
 * Every kind a diagram node's typed-ref (`{ <kind>: <slug> }`) may name.
 * Wider than `ARTIFACT_KINDS`: `class`, `interface`, and `function` are
 * valid C4-code-level ref kinds with no backing element schema or
 * directory today (Enterprise conformance note — see the c4-schema README
 * drift log). `diagram` itself is never a valid ref kind.
 */
export const C4_REF_KINDS = [
  'actor',
  'system',
  'external-system',
  'container',
  'component',
  'database',
  'queue',
  'domain',
  'feature',
  'class',
  'interface',
  'function',
] as const;

/** One of the twelve valid diagram node typed-ref kinds. */
export type C4RefKind = (typeof C4_REF_KINDS)[number];
