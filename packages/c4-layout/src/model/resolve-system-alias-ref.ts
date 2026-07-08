import { SYSTEM_ALIAS } from '@workspec/c4-schema';
import type { ResolvedDiagramNode } from '@workspec/c4-model';

/**
 * `.layout/` files key pins and edge-hints against the identifiers a human
 * authored in the diagram YAML — including the literal `__system__` alias
 * (see `@workspec/c4-model`'s `authoredLayoutableRefs`, which is what its
 * own orphan-pin check compares against). But a resolved node's `nodeId`
 * only keeps that literal when the alias was authored directly as a node
 * entry; when the system was *injected* (the c4-context safety net, or an
 * edge-only reference — see `@workspec/c4-model`'s `inject-system-node.ts`)
 * its `nodeId` is the system's real slug instead.
 *
 * This resolves that gap the same way `@workspec/c4-model`'s own edge
 * resolution does: `__system__` maps to whichever node in this view has
 * `kind: 'system'`. A raw ref that isn't the alias, or a view with no
 * system node at all, passes through unchanged.
 */
export function resolveSystemAliasRef(raw: string, nodes: readonly ResolvedDiagramNode[]): string {
  if (raw !== SYSTEM_ALIAS) return raw;
  const systemNode = nodes.find((node) => node.kind === 'system');
  return systemNode ? systemNode.nodeId : raw;
}
