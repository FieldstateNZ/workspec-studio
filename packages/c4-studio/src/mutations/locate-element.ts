import { artifactPathFor } from '@workspec/c4-schema';
import { ELEMENT_KINDS } from '@workspec/c4-model';
import type { C4FileSource, ElementKind } from '@workspec/c4-model';
import { mutationError, mutationOk } from './mutation-result.js';
import type { MutationResult } from './mutation-result.js';

/** An element found on disk: the kind directory that bears it and its repo-relative path. */
export interface LocatedElement {
  readonly kind: ElementKind;
  readonly path: string;
}

/**
 * Finds the file backing `(slug, kind?)`. With `kind` supplied this is a
 * single existence check; without it, every type directory is probed and
 * the result must be unique — two kinds bearing the same slug is a 409
 * (the caller must disambiguate), never a guess. Zero bearers is a plain
 * 404 either way. Identity is the path (`artifactPathFor`), so this never
 * reads file contents — a schema-broken file still locates, which is what
 * lets update repair it and delete remove it.
 */
export async function locateElement(
  source: C4FileSource,
  slug: string,
  kind?: ElementKind,
): Promise<MutationResult<LocatedElement>> {
  if (kind !== undefined) {
    const path = artifactPathFor(kind, slug);
    if (!(await source.exists(path))) {
      return mutationError(404, `no ${kind} element with slug "${slug}"`);
    }
    return mutationOk({ kind, path });
  }

  const bearers: LocatedElement[] = [];
  for (const candidate of ELEMENT_KINDS) {
    const path = artifactPathFor(candidate, slug);
    if (await source.exists(path)) bearers.push({ kind: candidate, path });
  }
  const first = bearers[0];
  if (first === undefined) {
    return mutationError(404, `no element with slug "${slug}"`);
  }
  if (bearers.length > 1) {
    const kinds = bearers.map((b) => b.kind).join(', ');
    return mutationError(409, `slug "${slug}" is ambiguous across kinds (${kinds}); supply "kind"`);
  }
  return mutationOk(first);
}
