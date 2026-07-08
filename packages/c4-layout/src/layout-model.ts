import type { C4Model, ResolvedDiagram } from '@workspec/c4-model';
import { layoutDiagram } from './layout-diagram.js';
import type { LaidOutDiagram } from './model/laid-out-diagram.types.js';
import type { LayoutDiagramOptions } from './model/layout-diagram-input.types.js';

/**
 * Lays out every diagram in a resolved `C4Model`, respecting each diagram's
 * own attached `.layout/` file. Pure fan-out over `layoutDiagram`: this
 * function decides nothing about placement itself, it only unpacks each
 * `ResolvedDiagram`'s `view`/`lensViews` split and re-packs the positioned
 * result the same way — a `c4-container` diagram lays out each lens
 * independently (they can pin different nodes, since each lens resolves a
 * different node subset from the same `.layout/` file) and returns both
 * under `lensViews`; every other diagram type lays out its one `view`.
 */
export async function layoutModel(
  model: C4Model,
  options: LayoutDiagramOptions = {},
): Promise<readonly LaidOutDiagram[]> {
  return Promise.all(model.diagrams.map((diagram) => layoutOneDiagram(diagram, options)));
}

async function layoutOneDiagram(diagram: ResolvedDiagram, options: LayoutDiagramOptions): Promise<LaidOutDiagram> {
  const layout = diagram.layout?.data ?? null;
  const base = { slug: diagram.slug, path: diagram.path, title: diagram.title, type: diagram.type };

  if (diagram.lensViews) {
    const [logical, deployment] = await Promise.all([
      layoutDiagram({ nodes: diagram.lensViews.logical.nodes, edges: diagram.lensViews.logical.edges, layout }, options),
      layoutDiagram(
        { nodes: diagram.lensViews.deployment.nodes, edges: diagram.lensViews.deployment.edges, layout },
        options,
      ),
    ]);
    return { ...base, view: null, lensViews: { logical, deployment } };
  }

  // A `ResolvedDiagram` always has exactly one of `view`/`lensViews`
  // non-null (see `@workspec/c4-model`'s `resolve-diagram.ts`); `view` is
  // guaranteed here since the `lensViews` branch above already returned.
  const view = diagram.view;
  if (!view) {
    return { ...base, view: { nodes: [], edges: [] }, lensViews: null };
  }

  const positioned = await layoutDiagram({ nodes: view.nodes, edges: view.edges, layout }, options);
  return { ...base, view: positioned, lensViews: null };
}
