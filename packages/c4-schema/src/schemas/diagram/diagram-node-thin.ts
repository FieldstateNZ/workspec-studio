import { z } from 'zod';
import { DiagramPosition } from './diagram-position.js';
import { C4_REF_KINDS } from './c4-ref-kinds.js';

const bareSlugNode = z
  .object({
    slug: z.string().describe('The element slug this node references, e.g. "architect".'),
    position: DiagramPosition.optional().describe('Optional inline pinned position for this node.'),
  })
  .strict()
  .describe(
    'An untyped node reference: an object `{ slug, position? }` (never a plain string) whose kind is ambiguous over C4_REF_KINDS and resolved by the loader.',
  );

const typedRefNodes = C4_REF_KINDS.map((kind) =>
  z
    .object({
      [kind]: z.string().describe(`The ${kind} element slug this node references.`),
      position: DiagramPosition.optional().describe(
        'Optional inline pinned position for this node.',
      ),
    })
    .strict()
    .describe(`A typed-ref node naming its kind explicitly: { ${kind}: <slug> }.`),
);

/**
 * A thin diagram node: either a bare `{ slug, position? }` reference (kind
 * disambiguated later by `PREFERRED_TYPE_BY_DIAGRAM`, out of scope here) or
 * an explicit typed-ref `{ <kind>: <slug>, position? }` for one of the
 * twelve `C4_REF_KINDS`.
 */
export const ThinDiagramNode = z.union([bareSlugNode, ...typedRefNodes]);

/** Inferred type of a thin diagram node. */
export type ThinDiagramNode = z.infer<typeof ThinDiagramNode>;
