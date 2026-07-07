import type { LoadedElement } from '../model/element-data.types.js';
import type { ElementKind } from '../model/element-kind.js';
import { ELEMENT_KINDS } from '../model/element-kind.js';
import type { LoadedElements } from '../loading/load-elements.js';

/**
 * Every kind that carries a given slug as a filename — "bearers" of that
 * slug. Enterprise reality (mirrored deliberately, see the S3 design
 * brief): a domain and a feature can both be named `billing`; that's not
 * itself an error, only a `duplicate-slug` warning risk *if* something
 * references the slug ambiguously (a bare diagram ref).
 */
export interface ElementBearerIndex {
  /** Every kind directory that has a file named `<slug>.yaml`, in `ELEMENT_KINDS` order. */
  bearersOf(slug: string): readonly ElementKind[];
  /** The loaded element for one (kind, slug) pair, or `null` if no such file exists. */
  get(kind: ElementKind, slug: string): LoadedElement | null;
}

/** Builds the bearer index from every element loaded across all kinds. */
export function buildElementBearerIndex(elements: LoadedElements): ElementBearerIndex {
  const bearers = new Map<string, ElementKind[]>();
  for (const kind of ELEMENT_KINDS) {
    for (const slug of elements.byKind[kind].keys()) {
      const existing = bearers.get(slug);
      if (existing) {
        existing.push(kind);
      } else {
        bearers.set(slug, [kind]);
      }
    }
  }

  return {
    bearersOf: (slug) => bearers.get(slug) ?? [],
    get: (kind, slug) => elements.byKind[kind].get(slug) ?? null,
  };
}
