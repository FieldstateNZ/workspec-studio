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
