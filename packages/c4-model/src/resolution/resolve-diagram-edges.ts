import type { DiagramEdge } from '@workspec/c4-schema';
import { DIAGNOSTIC_CODES } from '../model/diagnostic-codes.js';
import type { C4Diagnostic } from '../model/diagnostic.types.js';
import type { ResolvedDiagramEdge, ResolvedDiagramNode } from '../model/diagram-resolution.types.js';
import { makeDiagnostic } from '../diagnostics/make-diagnostic.js';
import type { YamlLocator } from '../diagnostics/yaml-locator.js';
import { isSystemAlias } from './system-alias.js';

/**
 * One diagram edge paired with its index in the diagram YAML's `edges`
 * array. Carried explicitly because c4-container lens filtering happens
 * before edge resolution — a filtered array's own indices would no longer
 * locate the right YAML entry for diagnostics.
 */
export interface IndexedDiagramEdge {
  readonly edge: DiagramEdge;
  readonly index: number;
}

/**
 * Edge categories Enterprise ships style defaults for even when `spec.yaml`
 * has no matching `connections` entry (see the conformance survey's Style
 * spec section). An edge's `category` is a free string everywhere — this
 * list only feeds the `unknown-category` warning, never a rejection.
 */
const BUILT_IN_CATEGORIES: ReadonlySet<string> = new Set(['interaction', 'data', 'governance', 'identity']);

/**
 * Resolves one edge endpoint (`from`/`to`) to the `nodeId` it refers to.
 * `__system__` resolves to whichever node in the view has `kind: 'system'`
 * — always present when the tree has a system, because system injection
 * (see `inject-system-node.ts`) materializes the node for any diagram
 * whose edges reference the alias. Only a genuinely missing system (no
 * `system/*.yaml` anywhere) leaves the alias unresolved, and that case is
 * already explained by the diagram's `no-system` diagnostic.
 */
function resolveEndpointId(raw: string, nodes: readonly ResolvedDiagramNode[]): string | null {
  if (isSystemAlias(raw)) {
    const systemNode = nodes.find((node) => node.kind === 'system');
    return systemNode ? systemNode.nodeId : null;
  }
  return nodes.some((node) => node.nodeId === raw) ? raw : null;
}

/** True when an endpoint is dangling specifically because it's the `__system__` alias and the tree has no system. */
function isUnresolvableSystemAlias(raw: string, systemSlug: string | null): boolean {
  return isSystemAlias(raw) && systemSlug === null;
}

/**
 * Resolves every edge of one diagram view against its already-resolved
 * nodes: rewrites `from`/`to` to the matching `nodeId`s, flags
 * unresolvable endpoints (`dangling-edge-ref`, located at the edge entry's
 * line via `locate(['edges', index])`), and flags a `category` that names
 * neither a built-in default nor a `spec.yaml` connections key
 * (`unknown-category`) — the category value itself is never rejected.
 */
export function resolveDiagramEdges(
  edges: readonly IndexedDiagramEdge[],
  nodes: readonly ResolvedDiagramNode[],
  systemSlug: string | null,
  knownSpecCategories: ReadonlySet<string>,
  diagramPath: string,
  locate: YamlLocator,
): { resolved: readonly ResolvedDiagramEdge[]; diagnostics: readonly C4Diagnostic[] } {
  const resolved: ResolvedDiagramEdge[] = [];
  const diagnostics: C4Diagnostic[] = [];

  for (const { edge, index } of edges) {
    const fromId = resolveEndpointId(edge.from, nodes);
    const toId = resolveEndpointId(edge.to, nodes);
    const dangling = fromId === null || toId === null;
    // A dangling `__system__` endpoint with no system anywhere in the tree
    // is already explained by this diagram's `no-system` diagnostic —
    // raising `dangling-edge-ref` too would just restate the same cause.
    const explainedByNoSystem =
      isUnresolvableSystemAlias(edge.from, systemSlug) || isUnresolvableSystemAlias(edge.to, systemSlug);

    if (dangling && !explainedByNoSystem) {
      diagnostics.push(
        makeDiagnostic(
          'error',
          DIAGNOSTIC_CODES.danglingEdgeRef,
          `edge ${JSON.stringify(edge.from)} -> ${JSON.stringify(edge.to)} does not resolve to nodes in this diagram`,
          diagramPath,
          { position: locate(['edges', index]) },
        ),
      );
    }

    if (edge.category && !BUILT_IN_CATEGORIES.has(edge.category) && !knownSpecCategories.has(edge.category)) {
      diagnostics.push(
        makeDiagnostic(
          'warning',
          DIAGNOSTIC_CODES.unknownCategory,
          `edge category "${edge.category}" is not a built-in default or a spec.yaml connections key`,
          diagramPath,
        ),
      );
    }

    resolved.push({
      from: fromId ?? edge.from,
      to: toId ?? edge.to,
      label: edge.label ?? null,
      category: edge.category ?? null,
      lens: edge.lens ?? null,
      dangling,
    });
  }

  return { resolved, diagnostics };
}
