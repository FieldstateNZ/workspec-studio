import { FILE_EXTENSION } from '@workspec/c4-schema';
import type { C4FileSource } from '../ports/c4-file-source.js';

/**
 * Lists `dirPath`'s immediate `.yaml` files via the source's non-recursive
 * `listFiles`, silently ignoring any non-`.yaml` entry (per the loader
 * pipeline's discovery step — a stray `README.md` or `.DS_Store` in a type
 * directory is not a WorkSpec artifact and never becomes a diagnostic).
 *
 * Sorted lexicographically before returning: neither `fs.readdir` nor a
 * `Map`'s key order is a contract a golden snapshot can depend on, so every
 * downstream consumer of this function sees a deterministic file order
 * regardless of which `C4FileSource` produced it.
 */
export async function listYamlFiles(source: C4FileSource, dirPath: string): Promise<readonly string[]> {
  const entries = await source.listFiles(dirPath);
  return entries.filter((path) => path.endsWith(FILE_EXTENSION)).sort();
}
