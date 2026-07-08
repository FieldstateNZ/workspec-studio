import { describe, expect, it } from 'vitest';
import { loadC4Model } from '../../src/load-c4-model.js';
import { createFsSource } from '../../src/sources/fs-source.js';
import { REPRESENTATIVE_ROOT } from '../helpers/fixture-paths.js';
import { serializableModel } from '../helpers/serializable.js';

/**
 * `@workspec/c4-schema`'s representative fixture: every supported element
 * kind, both thin node shapes, the `__system__` alias, edge label/category/
 * lens, and a `.layout/` file — read in place, exercised through the full
 * loader pipeline including `.layout/` joining and c4-container lens
 * partitioning.
 */
describe('representative fixture tree', () => {
  it('resolves cleanly (one expected dangling-link), its layout joined, and matches the committed snapshot', async () => {
    const model = await loadC4Model(createFsSource(REPRESENTATIVE_ROOT));

    // Unlike enterprise-subset, this fixture is not required to be
    // diagnostic-free (see the S3 brief's Tests section) — and in fact
    // isn't: `architect.yaml`'s `~/docs/architecture/README.md` link points
    // outside this fixture's own bounded `.workspec/` tree (that doc only
    // exists in the real monorepo), so a genuine `dangling-link` warning is
    // the correct, expected outcome here.
    expect(model.diagnostics).toMatchObject([{ severity: 'warning', code: 'dangling-link', slug: 'architect' }]);
    expect(model.diagrams).toHaveLength(2);

    const systemContext = model.diagrams.find((d) => d.slug === 'system-context');
    expect(systemContext?.layout?.data.nodes).toHaveProperty('architect');
    expect(systemContext?.layout?.data.viewport?.zoom).toBe(1);

    const container = model.diagrams.find((d) => d.slug === 'container');
    expect(container?.lensViews?.logical.nodes.map((n) => n.slug).sort()).toEqual(
      container?.lensViews?.deployment.nodes.map((n) => n.slug).sort(),
    );

    expect(serializableModel(model)).toMatchSnapshot();
  });
});
