import { describe, expect, it } from 'vitest';
import { layoutModel } from '../src/layout-model.js';
import { loadRepresentativeModel } from './helpers/load-representative-model.js';

/**
 * Golden snapshot: the fully positioned representative model, committed.
 * Any layout-affecting change (a spacing constant, an ELK option, the
 * elbow-routing shape, a pinning/nudge tweak) shows up as a reviewable diff
 * here rather than silently reshuffling every consumer's coordinates.
 */
describe('layoutModel golden snapshot', () => {
  it('positions the representative fixture identically to the committed snapshot', async () => {
    const model = await loadRepresentativeModel();
    const laidOut = await layoutModel(model);

    expect(laidOut.map((diagram) => diagram.slug)).toEqual(['container', 'system-context']);
    expect(laidOut).toMatchSnapshot();
  });
});
