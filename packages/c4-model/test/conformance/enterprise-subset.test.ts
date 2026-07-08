import { describe, expect, it } from 'vitest';
import { loadC4Model } from '../../src/load-c4-model.js';
import { createFsSource } from '../../src/sources/fs-source.js';
import { ENTERPRISE_SUBSET_ROOT } from '../helpers/fixture-paths.js';
import { serializableModel } from '../helpers/serializable.js';

/**
 * The FieldstateNZ/workspec repo's own (nearly empty) `.workspec/` tree,
 * vendored verbatim in `@workspec/c4-schema`'s fixtures and read here in
 * place (not copied — see the S3 report for why reading in place avoids
 * drift). Zero diagnostics is the load-bearing conformance signal — see
 * the S3 acceptance criteria (issue #4).
 */
describe('enterprise-subset golden snapshot', () => {
  it('loads with zero diagnostics and matches the committed snapshot', async () => {
    const model = await loadC4Model(createFsSource(ENTERPRISE_SUBSET_ROOT));

    expect(model.diagnostics).toEqual([]);
    expect(serializableModel(model)).toMatchSnapshot();
  });
});
