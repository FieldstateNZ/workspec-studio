import { describe, expect, it } from 'vitest';
import { DIAGNOSTIC_CODES } from '../../src/model/diagnostic-codes.js';
import { loadTopologyModel } from '../../src/load-topology-model.js';
import { createMemorySource } from '../../src/sources/memory-source.js';
import { readWebAppFixtureSeed } from '../helpers/read-web-app-fixture.js';

/**
 * `@workspec/topology-schema`'s "web-app" fixture: one topology spanning
 * dev/test/prod, an edge resource scoped to prod only, per-environment cost
 * overrides, and a network + resource-group placement graph — read in place
 * and loaded through the full pipeline. This is the base every golden
 * `resolve()`/lens-tree test in this suite builds on.
 */
describe('web-app fixture tree', () => {
  it('loads its singleton topology, every resource/environment, and exactly the expected dangling-catalog-ref warning', async () => {
    const model = await loadTopologyModel(createMemorySource(await readWebAppFixtureSeed()));

    // `web-app.topology.yaml` names `catalog: web-app-hosting`, but this
    // bounded fixture tree has no `.workspec/catalogs/` directory at all —
    // a genuine dangling-catalog-ref warning is the correct, expected
    // outcome here, mirroring c4-model's own representative-fixture test.
    expect(model.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: DIAGNOSTIC_CODES.danglingCatalogRef,
        refSlug: 'web-app-hosting',
      }),
    ]);

    expect(model.topology?.slug).toBe('web-app');
    expect(model.resources.size).toBe(11);
    expect([...model.environments.keys()].sort()).toEqual(['dev', 'prod', 'test']);
    expect(model.layout).toBeNull();
  });
});
