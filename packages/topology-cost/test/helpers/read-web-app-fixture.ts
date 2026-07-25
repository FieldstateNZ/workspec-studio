import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { MemorySourceSeed } from '@workspec/topology-model';
import { TOPOLOGY_SCHEMA_VALID_FIXTURES_ROOT } from './fixture-paths.js';

/** Maps a fixture's filename suffix to its real `.workspec/<type-dir>` directory name. */
const TYPE_DIR_BY_SUFFIX: Record<string, string> = {
  '.topology.yaml': 'topologies',
  '.resource.yaml': 'resources',
  '.environment.yaml': 'environments',
};

/**
 * Reads `@workspec/topology-schema`'s flat "web-app" fixture directory (one
 * topology, its resources, and its environments, all suffix-named in one
 * directory for that package's own schema-validation tests) and remaps every
 * file to its real `.workspec/<type-dir>/<slug>.yaml` path — the shape
 * `@workspec/topology-model`'s discovery/loading pipeline expects. Returns a
 * `MemorySourceSeed` ready for `createMemorySource`. Mirrors
 * `@workspec/topology-model`'s own test helper of the same name.
 */
export async function readWebAppFixtureSeed(): Promise<MemorySourceSeed> {
  const entries = await readdir(TOPOLOGY_SCHEMA_VALID_FIXTURES_ROOT, { withFileTypes: true });
  const seed: Record<string, string> = {};

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const suffix = Object.keys(TYPE_DIR_BY_SUFFIX).find((candidate) => entry.name.endsWith(candidate));
    if (!suffix) continue;

    const slug = entry.name.slice(0, -suffix.length);
    const typeDir = TYPE_DIR_BY_SUFFIX[suffix];
    const text = await readFile(join(TOPOLOGY_SCHEMA_VALID_FIXTURES_ROOT, entry.name), 'utf8');
    seed[`.workspec/${typeDir}/${slug}.yaml`] = text;
  }

  return seed;
}
