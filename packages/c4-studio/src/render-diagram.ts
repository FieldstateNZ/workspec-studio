// Shared rendering logic between the `render` CLI command and its tests:
// finds one diagram in an already-loaded `C4Model` by slug, lays it out, and
// renders it to a standalone SVG string via `@workspec/c4-ui`'s `renderSvg`.
//
// A `c4-container` diagram resolves to `lensViews` (logical + deployment),
// never a single `view` — this always renders the LOGICAL lens (the
// convention `C4Explorer` also defaults to). The `serve` command's
// interactive explorer is how you reach the deployment lens; the CLI's
// `render` command deliberately stays single-shot and doesn't grow a
// `--lens` flag for a distinction most trees won't need at all (a diagram
// with no `domain`-kind elements resolves identically under both lenses).

import type { C4Model, ResolvedDiagram, ResolvedDiagramView } from '@workspec/c4-model';
import { layoutDiagram } from '@workspec/c4-layout';
import { renderSvg } from '@workspec/c4-ui';
import type { ThemeName } from '@workspec/c4-ui';

export interface RenderDiagramOptions {
  /** Which theme's tokens to resolve into the SVG's literal colours. Defaults to `'light'`. */
  theme?: ThemeName;
}

export type RenderDiagramResult =
  | { readonly ok: true; readonly svg: string; readonly diagram: ResolvedDiagram }
  | { readonly ok: false; readonly availableSlugs: readonly string[] };

const EMPTY_VIEW: ResolvedDiagramView = { nodes: [], edges: [] };

/**
 * Finds `slug` in `model.diagrams`, lays it out (honouring any `.layout/`
 * pins), and renders it to a deterministic SVG string. Returns the available
 * slugs instead of throwing when `slug` doesn't match any diagram, so the
 * CLI can report a helpful error and exit non-zero.
 */
export async function renderDiagramToSvg(
  model: C4Model,
  slug: string,
  options: RenderDiagramOptions = {},
): Promise<RenderDiagramResult> {
  const diagram = model.diagrams.find((d) => d.slug === slug);
  if (diagram === undefined) {
    return { ok: false, availableSlugs: model.diagrams.map((d) => d.slug) };
  }

  const view = diagram.view ?? diagram.lensViews?.logical ?? EMPTY_VIEW;
  const positioned = await layoutDiagram({
    nodes: view.nodes,
    edges: view.edges,
    layout: diagram.layout?.data ?? null,
  });
  const svg = renderSvg(positioned, {
    spec: model.spec.data,
    title: diagram.title,
    ...(options.theme !== undefined ? { theme: options.theme } : {}),
  });
  return { ok: true, svg, diagram };
}
