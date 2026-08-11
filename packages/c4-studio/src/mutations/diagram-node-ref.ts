import { C4_REF_KINDS } from '@workspec/c4-schema';
import type { Diagram } from '@workspec/c4-schema';

/** One diagram node's reference, uniformly shaped across all three authored forms. */
export interface DiagramNodeRef {
  /** The slug the node references (thin bare/typed ref) or its `id` (fat node). */
  readonly slug: string;
  /**
   * The kind the node names explicitly: the typed-ref key for
   * `{ container: "x" }`, the inline `type` for a fat node, or `null` for
   * a bare `{ slug: "x" }` ref (kind ambiguity resolved by the loader).
   */
  readonly explicitKind: string | null;
}

/**
 * Reads one node of a validated `Diagram` (thin bare-slug, thin typed-ref,
 * or fat inline) into a uniform ref. Mirrors the classification
 * `@workspec/c4-model`'s internal `classifyThinNode` performs (that helper
 * is not part of the package's public surface), extended with the fat
 * shape: a fat node's `id` is what edges and `.layout/` keys address, and
 * its `type` is its explicit kind. The input is always
 * post-`parseDiagramYaml` data, so the loose record view is a narrowing
 * over a shape Zod has already confirmed, not a real `unknown`.
 */
export function diagramNodeRef(node: Diagram['nodes'][number]): DiagramNodeRef {
  const raw = node as Record<string, unknown>;
  if (typeof raw.id === 'string') {
    return { slug: raw.id, explicitKind: typeof raw.type === 'string' ? raw.type : null };
  }
  if (typeof raw.slug === 'string') {
    return { slug: raw.slug, explicitKind: null };
  }
  for (const kind of C4_REF_KINDS) {
    const value = raw[kind];
    if (typeof value === 'string') {
      return { slug: value, explicitKind: kind };
    }
  }
  throw new Error('unreachable: a validated diagram node always carries id, slug, or a typed ref');
}
