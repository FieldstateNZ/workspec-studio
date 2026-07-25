// Builds one of the two normative lens trees (spec §3.2) over a resolved
// topology, for the CLI's `render` command and the `resolve` HTTP/MCP
// surface's lens-shaped sibling. Full SVG rendering is
// `@workspec/topology-ui`'s job (`TopologyCanvas`) — this stays textual/JSON,
// matching a CLI's normal output contract.

import { buildNetworkTree, buildResourceGroupTree } from '@workspec/topology-model';
import type { LensId, LensTree, ResolvedTopology } from '@workspec/topology-model';

/** Builds the lens tree named by `lens` ('network' | 'rg') over `resolved`. */
export function buildLens(resolved: ResolvedTopology, lens: LensId): LensTree {
  return lens === 'network' ? buildNetworkTree(resolved) : buildResourceGroupTree(resolved);
}

/** Indents `text` by `depth` two-space levels. */
function indent(depth: number, text: string): string {
  return `${'  '.repeat(depth)}${text}`;
}

/**
 * Renders a `LensTree` as an indented text outline — container boxes as
 * `[kind] name (slug)` headers with their children nested underneath, plain
 * nodes as `- kind name (slug)` leaves. Deterministic (the tree's own child
 * order), meant for terminal/CI reading rather than machine parsing (use
 * `JSON.stringify(tree)` for that).
 */
export function renderLensText(tree: LensTree): string {
  const lines: string[] = [
    `${tree.lens} lens — ${tree.counts.resources} resource(s)`,
  ];

  function walk(entries: LensTree['roots'], depth: number): void {
    for (const entry of entries) {
      if (entry.type === 'container') {
        const { container } = entry;
        lines.push(indent(depth, `[${container.kind}] ${container.name} (${container.slug})`));
        walk(container.children, depth + 1);
      } else {
        const { node } = entry;
        lines.push(indent(depth, `- ${node.kind} ${node.name} (${node.slug})`));
      }
    }
  }
  walk(tree.roots, 1);

  return `${lines.join('\n')}\n`;
}
