import { SYSTEM_ALIAS } from '@workspec/c4-schema';

/**
 * Whether a relation-route endpoint addresses the endpoint a diagram
 * actually AUTHORED.
 *
 * The two can differ by exactly one substitution, and only one: a diagram
 * may write `__system__` where the resolver (and therefore the canvas, and
 * therefore every request the canvas sends) sees the system element's real
 * slug. `@workspec/c4-model`'s `resolveDiagramEdges` rewrites the alias to
 * that slug and keeps no record of the original token, so a canvas gesture
 * on such an edge — rename its label, delete it, draw a second one — asks
 * for `author -> workspec-studio` while the file says
 * `author -> __system__`. Matching the raw strings makes every one of those
 * gestures miss (a 404 from rename/delete, a 400 from create) with the
 * diagram plainly showing the edge.
 *
 * Both directions are accepted, so a client that addresses the alias
 * directly (the schema allows it — see `relationEndpointField`) works
 * against a diagram that authored the real slug too.
 *
 * @param authored the endpoint exactly as the diagram file writes it.
 * @param requested the endpoint the request names.
 * @param systemSlug the tree's system slug, or `null` when it has none —
 *   with no system the alias stands for nothing and only exact matches hold.
 */
export function relationEndpointMatches(
  authored: string,
  requested: string,
  systemSlug: string | null,
): boolean {
  if (authored === requested) return true;
  if (systemSlug === null) return false;
  if (authored === SYSTEM_ALIAS && requested === systemSlug) return true;
  return requested === SYSTEM_ALIAS && authored === systemSlug;
}
