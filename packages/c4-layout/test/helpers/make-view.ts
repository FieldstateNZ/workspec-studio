import type { ResolvedDiagramEdge, ResolvedDiagramNode } from '@workspec/c4-model';

/**
 * Minimal synthetic `ResolvedDiagramNode` for tests that need shapes the
 * representative fixture doesn't produce (dangling edges, empty views,
 * deliberately colliding pins). Typed against `@workspec/c4-model`'s real
 * exported interface — never a locally re-declared lookalike — so any
 * field drift in c4-model breaks these tests at compile time instead of
 * silently diverging (the fieldstate-testing rule against hand-typed
 * domain shapes).
 */
export function makeNode(
  nodeId: string,
  overrides: Partial<ResolvedDiagramNode> = {},
): ResolvedDiagramNode {
  return {
    nodeId,
    slug: nodeId,
    kind: 'container',
    title: nodeId,
    description: null,
    technology: null,
    tags: [],
    position: null,
    injected: false,
    dangling: false,
    ...overrides,
  };
}

/** Minimal synthetic `ResolvedDiagramEdge` — same rationale as {@link makeNode}. */
export function makeEdge(
  from: string,
  to: string,
  overrides: Partial<ResolvedDiagramEdge> = {},
): ResolvedDiagramEdge {
  return {
    from,
    to,
    label: null,
    category: null,
    lens: null,
    dangling: false,
    ...overrides,
  };
}
