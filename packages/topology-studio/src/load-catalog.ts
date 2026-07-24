// Loads the pricing `Catalog` (`@workspec/decision-schema`) a resolved
// topology's `spec.catalog` slug names, from `.workspec/catalogs/<slug>.yaml`
// — the same type directory `@workspec/decision-studio` reads its catalogs
// from. Topology Studio never WRITES a catalog; it only reads one to price a
// resolved topology (`@workspec/topology-cost`'s `computeTopologyCost`), so
// this is a thin read-only helper, not a repository method.

import { readFile } from 'node:fs/promises';
import { posix } from 'node:path';
import { FILE_EXTENSION } from '@workspec/schema-core';
import { parseCatalogYaml, typeDirectoryFor } from '@workspec/decision-schema';
import type { Catalog, ParseIssue } from '@workspec/decision-schema';
import type { Ref } from '@workspec/topology-schema';
import type { FsRepository } from './fs-repository.js';

/** The outcome of {@link loadCatalog}. */
export type LoadCatalogOutcome =
  | { kind: 'ok'; ref: Ref; catalog: Catalog }
  | { kind: 'not-found'; ref: Ref }
  | { kind: 'invalid'; ref: Ref; issues: ParseIssue[] };

/** Builds the ref of the catalog `catalogSlug` names: `.workspec/catalogs/<catalogSlug>.yaml`. */
export function catalogRefFor(catalogSlug: string): Ref {
  return posix.join(typeDirectoryFor('Catalog'), `${catalogSlug}${FILE_EXTENSION}`);
}

/** Reads and validates the catalog named by `catalogSlug` under `repo`'s root. */
export async function loadCatalog(repo: FsRepository, catalogSlug: string): Promise<LoadCatalogOutcome> {
  const ref = catalogRefFor(catalogSlug);
  let text: string;
  try {
    text = await readFile(repo.resolve(ref), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { kind: 'not-found', ref };
    throw error;
  }
  const parsed = parseCatalogYaml(text);
  if (!parsed.ok) return { kind: 'invalid', ref, issues: parsed.errors };
  return { kind: 'ok', ref, catalog: parsed.data };
}
