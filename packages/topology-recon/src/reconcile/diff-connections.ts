import type { ResolvedConnection } from '@workspec/topology-model';
import type { DerivedConnection } from '../model/derived-topology.types.js';
import type { MiswiredDrift, MiswiredEdge } from '../model/drift.types.js';
import type { ResourceMatch } from '../match/match-resources.types.js';

/** Declared-then-observed, matching the spec's own worked-example phrasing ("authored X routes via Y; actual X is direct"). */
const EDGE_SIDE_ORDER: readonly MiswiredEdge['side'][] = ['authored-only', 'actual-only'];

interface CanonicalEdge {
  readonly from: string;
  readonly to: string;
  readonly class: string;
}

/** A key stable enough to dedupe edges by; slugs and `class` never contain `->`/`::`, so this can't collide across distinct edges. */
function edgeKey(edge: CanonicalEdge): string {
  return `${edge.from}->${edge.to}::${edge.class}`;
}

/** Minimal union-find over a fixed node set, used to cluster differing edges by shared endpoints (local to this module — see `diffConnections`). */
function createUnionFind(nodes: Iterable<string>): {
  find: (x: string) => string;
  union: (a: string, b: string) => void;
} {
  const parent = new Map<string, string>([...nodes].map((n) => [n, n]));

  function find(x: string): string {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root) as string;
    let cursor = x;
    while (cursor !== root) {
      const next = parent.get(cursor) as string;
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  }

  function union(a: string, b: string): void {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootA, rootB);
  }

  return { find, union };
}

function buildMiswiredMessage(edges: readonly MiswiredEdge[]): string {
  const removed = edges.filter((e) => e.side === 'authored-only').map((e) => `${e.from}->${e.to}`);
  const added = edges.filter((e) => e.side === 'actual-only').map((e) => `${e.from}->${e.to}`);

  const parts: string[] = [];
  if (removed.length > 0) parts.push(`declared but not observed: ${removed.join(', ')}`);
  if (added.length > 0) parts.push(`observed but not declared: ${added.join(', ')}`);
  return `Connections differ (${parts.join('; ')}).`;
}

/**
 * Diffs the authored and actual connection graphs, restricted to the matched
 * node set — spec §4's `miswired` class: "an authored edge absent in actual,
 * or an actual edge absent in authored, for the matched node set". Only
 * edges where BOTH endpoints have a counterpart on the other side are
 * considered; an edge touching an unmatched resource is not separately
 * flagged here (that resource's own `phantom`/`orphan` drift already covers
 * it, and re-flagging its edges too would be redundant noise).
 *
 * Actual edges are re-slugged through `matches` to their authored-canonical
 * endpoint slugs before comparison, so a renamed slug on the actual side
 * (adapters derive slugs from resource names, which can collide/differ from
 * the authored slug) never produces a false miswire.
 *
 * Differing edges are grouped into connected components by shared endpoint
 * (union-find) rather than reported one row per edge: a single rerouted path
 * (e.g. a bypassed private endpoint) touches several edges at once, and
 * reporting them as one `MiswiredDrift` reads as the one wiring event it is,
 * not three unrelated-looking rows.
 *
 * `actualConnections === undefined` means connectivity was never observed for
 * the actual side (see `DerivedTopology.connections`'s doc comment) — this
 * function then skips miswired detection entirely and returns `[]`, rather
 * than diffing against an implicit empty graph (which would flag every
 * authored edge as a false "authored-only" miswire). A present-but-empty
 * array is assessed exactly as any other array: every authored edge legitimately
 * reports as missing.
 */
export function diffConnections(
  authoredConnections: readonly ResolvedConnection[],
  actualConnections: readonly DerivedConnection[] | undefined,
  matches: readonly ResourceMatch[],
): readonly MiswiredDrift[] {
  if (actualConnections === undefined) return [];

  const matchedAuthoredSlugs = new Set(matches.map((m) => m.authoredSlug));
  const actualToAuthoredSlug = new Map(matches.map((m) => [m.actualSlug, m.authoredSlug]));

  const authoredEdges: CanonicalEdge[] = authoredConnections
    .filter((c) => matchedAuthoredSlugs.has(c.from) && matchedAuthoredSlugs.has(c.to))
    .map((c) => ({ from: c.from, to: c.to, class: c.class }));

  const actualEdges: CanonicalEdge[] = [];
  for (const c of actualConnections) {
    const from = actualToAuthoredSlug.get(c.from);
    const to = actualToAuthoredSlug.get(c.to);
    if (!from || !to) continue;
    actualEdges.push({ from, to, class: c.class });
  }

  const authoredKeys = new Set(authoredEdges.map(edgeKey));
  const actualKeys = new Set(actualEdges.map(edgeKey));

  const differing: { readonly edge: CanonicalEdge; readonly side: MiswiredEdge['side'] }[] = [
    ...authoredEdges
      .filter((e) => !actualKeys.has(edgeKey(e)))
      .map((edge) => ({ edge, side: 'authored-only' as const })),
    ...actualEdges
      .filter((e) => !authoredKeys.has(edgeKey(e)))
      .map((edge) => ({ edge, side: 'actual-only' as const })),
  ];
  if (differing.length === 0) return [];

  const nodes = new Set<string>();
  differing.forEach(({ edge }) => {
    nodes.add(edge.from);
    nodes.add(edge.to);
  });
  const { find, union } = createUnionFind(nodes);
  differing.forEach(({ edge }) => union(edge.from, edge.to));

  const clusters = new Map<
    string,
    { readonly slugs: Set<string>; readonly edges: MiswiredEdge[] }
  >();
  for (const { edge, side } of differing) {
    const root = find(edge.from);
    const cluster = clusters.get(root) ?? { slugs: new Set<string>(), edges: [] };
    cluster.slugs.add(edge.from);
    cluster.slugs.add(edge.to);
    cluster.edges.push({ from: edge.from, to: edge.to, class: edge.class, side });
    clusters.set(root, cluster);
  }

  return [...clusters.values()]
    .map((cluster) => {
      const edges = [...cluster.edges].sort(
        (a, b) =>
          EDGE_SIDE_ORDER.indexOf(a.side) - EDGE_SIDE_ORDER.indexOf(b.side) ||
          a.from.localeCompare(b.from) ||
          a.to.localeCompare(b.to),
      );
      return {
        class: 'miswired' as const,
        slugs: [...cluster.slugs].sort(),
        message: buildMiswiredMessage(edges),
        edges,
      };
    })
    .sort((a, b) => (a.slugs[0] ?? '').localeCompare(b.slugs[0] ?? ''));
}
