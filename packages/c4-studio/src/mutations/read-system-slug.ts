import { artifactPathFor, slugFromPath } from '@workspec/c4-schema';
import type { C4FileSource } from '@workspec/c4-model';

// `.workspec/system` — derived from the canonical path builder rather than
// spelled out, so the directory name cannot drift from `artifactPathFor`.
const SYSTEM_PROBE = artifactPathFor('system', '_');
const SYSTEM_DIR = SYSTEM_PROBE.slice(0, SYSTEM_PROBE.lastIndexOf('/'));

/**
 * The slug of the tree's system element, or `null` when the tree has none.
 *
 * This is the value the `__system__` alias stands for. `loadC4Model` picks
 * it the same way — the first slug under `system/` in sort order
 * (`load-c4-model.ts`) — and the mutation layer must agree with the loader,
 * because the canvas addresses edges by the slugs the LOADER resolved while
 * the diagram file still says `__system__` (see `relationEndpointMatches`).
 *
 * A tree with two system files is already ambiguous for the loader; taking
 * the same first-in-sort-order entry keeps one answer rather than inventing
 * a second rule here.
 */
export async function readSystemSlug(source: C4FileSource): Promise<string | null> {
  const files = await source.listFiles(SYSTEM_DIR);
  const slugs = files
    .map((path) => slugFromPath(path))
    .filter((slug): slug is string => slug !== null)
    .sort();
  return slugs[0] ?? null;
}
