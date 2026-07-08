import { describe, expect, it } from 'vitest';
import { loadC4Model } from '../src/load-c4-model.js';
import { createMemorySource } from '../src/sources/memory-source.js';
import { createFsSource } from '../src/sources/fs-source.js';
import { ENTERPRISE_SUBSET_ROOT, REPRESENTATIVE_ROOT } from './helpers/fixture-paths.js';
import { readFixtureTree } from './helpers/read-fixture-tree.js';
import { serializableModel } from './helpers/serializable.js';

/**
 * `loadC4Model` must behave identically regardless of which
 * `C4FileSource` backs it — this is the whole point of the port. Loads
 * each golden fixture tree once via `FsSource` (real disk I/O) and once
 * via `MemorySource` seeded with the exact same files, and asserts the
 * resulting models are deep-equal in full, including `diagnostics`.
 */
describe.each([
  ['enterprise-subset', ENTERPRISE_SUBSET_ROOT],
  ['representative', REPRESENTATIVE_ROOT],
])('%s: FsSource and MemorySource load identically', (_name, root) => {
  it('produces deep-equal models', async () => {
    const seed = await readFixtureTree(root);

    const viaFs = await loadC4Model(createFsSource(root));
    const viaMemory = await loadC4Model(createMemorySource(seed));

    expect(serializableModel(viaMemory)).toEqual(serializableModel(viaFs));
  });
});
