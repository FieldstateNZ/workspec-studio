// Acceptance gate for S6 part 2: "the repo documents itself." Runs the real
// CLI against workspec-studio's OWN `.workspec/` tree at the repo root (not a
// fixture) and asserts (a) it validates with zero diagnostics, and (b) the
// two SVGs embedded in the root README (`docs/c4/studio-*.svg`) are exactly
// what re-rendering the tree right now would produce — determinism makes
// this an honest staleness gate: if someone edits `.workspec/` without
// re-running `pnpm run render:c4`, this test catches the drift.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadC4Model } from '@workspec/c4-model';
import { createFsSource } from '@workspec/c4-model/fs';
import { renderDiagramToSvg } from './render-diagram.js';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

describe("the repo's own .workspec/ tree (dogfood)", () => {
  it('validates with zero diagnostics', async () => {
    const model = await loadC4Model(createFsSource(REPO_ROOT));
    expect(model.diagnostics).toEqual([]);
    expect(model.diagrams.map((d) => d.slug)).toEqual(
      expect.arrayContaining(['system-context', 'container']),
    );
  });

  it('every container node is pinned by the committed .layout/ file', async () => {
    // The hand-arranged layout (#134) is what makes the container level
    // readable: enterprise runs auto-layout ONLY when a diagram has zero
    // saved positions and otherwise renders hand-arranged coordinates, and
    // this tree had no `.layout/container.yaml` at all, so every load was a
    // cold auto-layout. A PARTIAL pin set is the dangerous state — the
    // unpinned nodes get nudged around the pinned ones and the careful
    // arrangement silently degrades — so assert total coverage, not merely
    // that the file exists.
    //
    // Mutation guard: deleting the layout file, or adding a node to
    // container.yaml without pinning it, fails this.
    const model = await loadC4Model(createFsSource(REPO_ROOT));
    const container = model.diagrams.find((d) => d.slug === 'container');
    if (!container) throw new Error('container diagram missing');
    const pinned = new Set(Object.keys(container.layout?.data?.nodes ?? {}));
    const view = container.view ?? container.lensViews?.deployment;
    if (!view) throw new Error('container view missing');
    const unpinned = view.nodes.map((n) => n.nodeId).filter((id) => !pinned.has(id));
    expect(unpinned).toEqual([]);
    expect(pinned.size).toBeGreaterThan(0);
  });

  it.each(['system-context', 'container'])(
    'docs/c4/studio-%s.svg matches re-rendering the tree right now',
    async (slug) => {
      const model = await loadC4Model(createFsSource(REPO_ROOT));
      const result = await renderDiagramToSvg(model, slug);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('unreachable');
      const committed = await readFile(`${REPO_ROOT}/docs/c4/studio-${slug}.svg`, 'utf8');
      expect(result.svg).toBe(committed);
    },
  );
});
