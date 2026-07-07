import type { ElementData } from './element-data.types.js';

/** The display fields every diagram node view needs, pulled uniformly out of any element kind. */
export interface ElementDisplayFields {
  readonly title: string;
  readonly description: string | null;
  readonly technology: string | null;
  readonly tags: readonly string[];
}

/**
 * Extracts the shared display fields from a kind-tagged element. Only
 * `container`/`component`/`database`/`queue` carry `technology`; every
 * kind except `feature` carries `tags` — both are `null`/`[]` where absent
 * rather than `undefined`, so every {@link ElementDisplayFields} field is
 * always defined for callers.
 */
export function elementDisplayFields(element: ElementData): ElementDisplayFields {
  const { data } = element;
  return {
    title: data.title,
    description: data.description ?? null,
    technology: 'technology' in data ? (data.technology ?? null) : null,
    tags: 'tags' in data ? (data.tags ?? []) : [],
  };
}
