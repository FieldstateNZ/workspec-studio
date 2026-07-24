// Test-only helper: reads `@workspec/topology-schema`'s flat "web-app"
// golden fixture directory (one topology, its resources, and its
// environments — the same fixture `@workspec/topology-model`'s own golden
// tests seed from) and remaps every file to its real
// `.workspec/<type-dir>/<slug>.yaml` path, ready for `createMemorySource`.
// Mirrors `@workspec/topology-model`'s own
// `test/helpers/read-web-app-fixture.ts` exactly (read in place rather than
// vendored, so this package's tests never drift from the shared fixture).

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MemorySourceSeed } from '@workspec/topology-model';

const here = dirname(fileURLToPath(import.meta.url));

/** Absolute path to `@workspec/topology-schema`'s "web-app" golden fixture files. */
const TOPOLOGY_SCHEMA_VALID_FIXTURES_ROOT = join(
  here,
  '../../../topology-schema/test/fixtures/valid',
);

/** Maps a fixture's filename suffix to its real `.workspec/<type-dir>` directory name. */
const TYPE_DIR_BY_SUFFIX: Record<string, string> = {
  '.topology.yaml': 'topologies',
  '.resource.yaml': 'resources',
  '.environment.yaml': 'environments',
};

/**
 * Reads the web-app fixture directory and remaps every file to its real
 * `.workspec/<type-dir>/<slug>.yaml` path — the shape
 * `@workspec/topology-model`'s discovery/loading pipeline expects. Returns
 * a {@link MemorySourceSeed} ready for `createMemorySource`.
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
