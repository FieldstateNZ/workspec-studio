import type { ElementData } from '../model/element-data.types.js';
import type { ElementBearerIndex } from './element-bearer-index.js';

/** Looks up the tree's system element by its slug, for the c4-context injection safety net. */
export function detectSystemFor(
  bearers: ElementBearerIndex,
  systemSlug: string | null,
): { readonly slug: string; readonly element: ElementData } | null {
  if (systemSlug === null) return null;
  const loaded = bearers.get('system', systemSlug);
  return loaded ? { slug: systemSlug, element: loaded.element } : null;
}
