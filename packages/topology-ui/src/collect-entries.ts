// Flattens a lens tree's `roots` into its containers and (plain) nodes, in
// pre-order (a container before its own children). Shared by
// `TopologyCanvas` (canvas boundary boxes + node cards) and `ResourceList`
// (the side panel's resource rows + boundary legend) so both always agree
// on exactly which entries are "a node" vs "a boundary" for the ACTIVE
// lens — the same grouping-kind-as-container-in-its-own-lens rule
// `@workspec/topology-model` applies (see that package's `grouping-kind.ts`).

import type { LensContainer, LensEntry, LensNode } from '@workspec/topology-model';

/** The result of flattening a lens tree: every container and every plain node it contains, in pre-order. */
export interface CollectedEntries {
  readonly containers: readonly LensContainer[];
  readonly nodes: readonly LensNode[];
}

export function collectEntries(entries: readonly LensEntry[]): CollectedEntries {
  const containers: LensContainer[] = [];
  const nodes: LensNode[] = [];

  function visit(entry: LensEntry): void {
    if (entry.type === 'container') {
      containers.push(entry.container);
      entry.container.children.forEach(visit);
    } else {
      nodes.push(entry.node);
    }
  }

  entries.forEach(visit);
  return { containers, nodes };
}
