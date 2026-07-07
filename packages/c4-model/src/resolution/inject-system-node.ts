import { elementDisplayFields } from '../model/element-display.js';
import type { ElementData } from '../model/element-data.types.js';
import type { ResolvedDiagramNode } from '../model/diagram-resolution.types.js';

/**
 * Materializes the system node into a view's node set when it's needed but
 * not authored, so the resolved node set and edge endpoints stay
 * consistent for every diagram type. Two triggers:
 *
 * - **c4-context safety net** (mirrors Enterprise's `get-diagram.ts`
 *   injection block): a `c4-context` diagram that never references the
 *   system gets it folded in as the first node anyway — a System Context
 *   view without the system makes no C4 sense.
 * - **Edge-only `__system__` references, any diagram type**: an edge whose
 *   `from`/`to` is the alias needs a real node to resolve against; without
 *   injection the endpoint would point at a node absent from the view
 *   (the "phantom endpoint" the S3 adversarial review's B1 flagged).
 *
 * The injected node's id is the *real* system slug (not the `__system__`
 * literal), matching Enterprise's choice for its safety-net injection —
 * when the alias IS authored as a node entry, that node resolves normally
 * (keeping `__system__` as its id) and no injection happens, since it
 * already has `kind: 'system'`.
 *
 * A no-op when there's no system element to inject: an empty tree stays
 * empty, and a diagram whose edges reference the alias with no system
 * anywhere is already covered by that diagram's `no-system` diagnostic.
 */
export function injectSystemNodeIfMissing(
  diagramType: string,
  nodes: readonly ResolvedDiagramNode[],
  edgesReferenceSystem: boolean,
  system: { readonly slug: string; readonly element: ElementData } | null,
): readonly ResolvedDiagramNode[] {
  if (!system) return nodes;
  if (diagramType !== 'c4-context' && !edgesReferenceSystem) return nodes;
  if (nodes.some((node) => node.kind === 'system')) return nodes;

  const display = elementDisplayFields(system.element);
  const injected: ResolvedDiagramNode = {
    nodeId: system.slug,
    slug: system.slug,
    kind: 'system',
    title: display.title,
    description: display.description,
    technology: display.technology,
    tags: display.tags,
    position: null,
    injected: true,
    dangling: false,
  };
  return [injected, ...nodes];
}
