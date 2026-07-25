import { isGroupingKindForLens } from '../model/grouping-kind.js';
import type { LensEntry, LensId, LensTree, LensTreeCounts } from '../model/lens-tree.types.js';
import type { ResolvedResource, ResolvedTopology } from '../model/resolved-topology.types.js';

function placementSlug(resource: ResolvedResource, lens: LensId): string | null {
  return lens === 'network' ? resource.network : resource.resourceGroup;
}

function displayName(resource: ResolvedResource, lens: LensId, resolved: ResolvedTopology): string {
  if (lens === 'rg' && resource.kind === 'resource-group') {
    return resolved.resourceGroupNames.get(resource.slug) ?? resource.name;
  }
  return resource.name;
}

/**
 * Builds one lens's tree — the shared implementation behind
 * `buildNetworkTree`/`buildResourceGroupTree`. NORMATIVE rule (spec §3.2): a
 * resource renders as a container box here iff its `kind` is the grouping
 * kind for THIS `lens` (checked via `isGroupingKindForLens`); every other
 * resource, including a resource of the OTHER lens's grouping kind, renders
 * as an ordinary node. Nesting comes from each resource's own placement ref
 * (`network` for the network lens, `resourceGroup` for the resource-group
 * lens) naming its PARENT container's slug — never from the container's own
 * fields, since a container names what's above it the same way a leaf does.
 *
 * A placement ref that doesn't resolve within `resolved.resources` (dangling
 * — already diagnosed at load time by `checkDanglingPlacementRefs` — or
 * simply pruned out of THIS environment) degrades gracefully: the resource
 * renders as a top-level entry instead of nesting, rather than being
 * dropped. A placement cycle (a user-authored error no schema forbids)
 * degrades the same way for whichever member of the cycle is reached second
 * — every surviving resource is guaranteed to appear in the tree exactly
 * once, never silently lost.
 */
export function buildLensTree(resolved: ResolvedTopology, lens: LensId): LensTree {
  const bySlug = new Map(resolved.resources.map((resource) => [resource.slug, resource]));
  const childrenByParent = new Map<string, ResolvedResource[]>();
  const topLevel: ResolvedResource[] = [];

  for (const resource of resolved.resources) {
    const parentSlug = placementSlug(resource, lens);
    const parent = parentSlug ? bySlug.get(parentSlug) : undefined;
    if (parent && parent.slug !== resource.slug) {
      const siblings = childrenByParent.get(parent.slug) ?? [];
      siblings.push(resource);
      childrenByParent.set(parent.slug, siblings);
    } else {
      topLevel.push(resource);
    }
  }

  const visited = new Set<string>();

  function buildEntry(resource: ResolvedResource): LensEntry {
    visited.add(resource.slug);

    if (isGroupingKindForLens(resource.kind, lens)) {
      const children = (childrenByParent.get(resource.slug) ?? [])
        .filter((child) => !visited.has(child.slug))
        .map(buildEntry);
      return {
        type: 'container',
        container: {
          slug: resource.slug,
          kind: resource.kind,
          name: displayName(resource, lens, resolved),
          position: null,
          children,
        },
      };
    }

    return {
      type: 'node',
      node: { slug: resource.slug, kind: resource.kind, name: resource.name, position: null },
    };
  }

  const roots = topLevel.filter((r) => !visited.has(r.slug)).map(buildEntry);
  // Cycle fallback: anything a placement cycle kept out of both `topLevel`
  // and every reachable container's children is appended as an extra root,
  // in slug order, so it still appears exactly once.
  const strandedRoots = resolved.resources
    .filter((r) => !visited.has(r.slug))
    .map(buildEntry);

  return { lens, roots: [...roots, ...strandedRoots], counts: countEntries([...roots, ...strandedRoots]) };
}

function countEntries(roots: readonly LensEntry[]): LensTreeCounts {
  let resources = 0;
  const containersByKind: Record<string, number> = {};

  function visit(entry: LensEntry): void {
    resources += 1;
    if (entry.type === 'container') {
      containersByKind[entry.container.kind] = (containersByKind[entry.container.kind] ?? 0) + 1;
      entry.container.children.forEach(visit);
    }
  }

  roots.forEach(visit);
  return { resources, containersByKind };
}
