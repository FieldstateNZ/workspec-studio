import { C4_REF_KINDS } from '@workspec/c4-schema';
import type { C4RefKind, ThinDiagramNode } from '@workspec/c4-schema';

/** A thin diagram node's ref, uniformly shaped regardless of whether it was authored bare or typed. */
export interface ClassifiedThinNode {
  readonly slug: string;
  /** The typed-ref kind (`{component: "x"}`), or `null` for a bare `{slug: "x"}` ref — ambiguity resolved later. */
  readonly explicitKind: C4RefKind | null;
  readonly position: { readonly x: number; readonly y: number } | null;
}

/**
 * Reads a `ThinDiagramNode`'s ref out of its bare-slug-or-typed-ref union
 * shape. Both schema variants are `.strict()` (see `@workspec/c4-schema`'s
 * drift log divergence (b)), so a typed-ref node has exactly one
 * `C4_REF_KINDS` key alongside its optional `position` — the first (only)
 * one found is it.
 */
export function classifyThinNode(node: ThinDiagramNode): ClassifiedThinNode {
  // `node` is already Zod-validated by the time it reaches this package (a
  // bare-slug-or-typed-ref union whose every member is `.strict()` with an
  // optional `position: {x,y}`), so reading it through a loose record view
  // here is a safe, deliberate narrowing rather than a real `unknown` —
  // Zod v4's inferred type for this particular computed-property-over-a-
  // mapped-tuple union widens further than the schema's actual runtime
  // shape, so matching it structurally field-by-field is more robust than
  // fighting that inferred type.
  const raw = node as unknown as Record<string, unknown>;
  const rawPosition = raw.position;
  const position =
    rawPosition && typeof rawPosition === 'object' && 'x' in rawPosition && 'y' in rawPosition
      ? { x: Number(rawPosition.x), y: Number(rawPosition.y) }
      : null;

  if (typeof raw.slug === 'string') {
    return { slug: raw.slug, explicitKind: null, position };
  }

  for (const kind of C4_REF_KINDS) {
    const value = raw[kind];
    if (typeof value === 'string') {
      return { slug: value, explicitKind: kind, position };
    }
  }

  throw new Error('unreachable: a ThinDiagramNode always carries either `slug` or exactly one C4_REF_KINDS key');
}
