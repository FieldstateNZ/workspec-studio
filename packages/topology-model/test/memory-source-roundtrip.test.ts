import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadTopologyModel } from '../src/load-topology-model.js';
import { createFsSource } from '../src/sources/fs-source.js';
import { createMemorySource } from '../src/sources/memory-source.js';
import type { MemorySourceSeed } from '../src/sources/memory-source.js';
import { readWebAppFixtureSeed } from './helpers/read-web-app-fixture.js';
import { serializableModel } from './helpers/serializable.js';

async function writeSeedToDisk(root: string, seed: MemorySourceSeed): Promise<void> {
  for (const [path, content] of Object.entries(seed)) {
    const fullPath = join(root, path);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, 'utf8');
  }
}

/**
 * `loadTopologyModel` must behave identically regardless of which
 * `TopologyFileSource` backs it — this is the whole point of the port.
 * Materialises the web-app fixture seed onto a real temp directory
 * (`FsSource`, real disk I/O) and loads the exact same seed via
 * `MemorySource`, asserting the resulting models are deep-equal in full,
 * including `diagnostics`. Mirrors `@workspec/c4-model`'s own
 * FsSource/MemorySource roundtrip test.
 */
describe('web-app fixture: FsSource and MemorySource load identically', () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  });

  it('produces deep-equal models', async () => {
    const seed = await readWebAppFixtureSeed();
    tempDir = await mkdtemp(join(tmpdir(), 'topology-model-roundtrip-'));
    await writeSeedToDisk(tempDir, seed);

    const viaFs = await loadTopologyModel(createFsSource(tempDir));
    const viaMemory = await loadTopologyModel(createMemorySource(seed));

    expect(serializableModel(viaMemory)).toEqual(serializableModel(viaFs));
  });
});
