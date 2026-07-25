// Automatic per-endpoint fan-out for `orthoPath`'s `sOff`/`tOff` — a
// generic stand-in for the authoritative design's HAND-AUTHORED per-edge
// channel offsets (its `STEPS`/`AUTH` arrays), which this package's actual
// input (`ResolvedConnection`, just `{ from, to, class }`) carries no
// equivalent of. Multiple edges leaving (or arriving at) the same node get
// spread evenly across a small perpendicular offset instead of stacking
// exactly on top of each other — deterministic (stable sort by the edges'
// own declaration order), so a re-render never jitters the layout.

export interface FanOffset {
  readonly sOff: number;
  readonly tOff: number;
}

/** One perpendicular step between two edges fanned from/to the same node. */
const FAN_STEP = 9;

function fanOffsetsFor(groups: ReadonlyMap<string, number[]>): Map<number, number> {
  const offsets = new Map<number, number>();
  for (const indices of groups.values()) {
    const count = indices.length;
    indices.forEach((edgeIndex, position) => {
      offsets.set(edgeIndex, (position - (count - 1) / 2) * FAN_STEP);
    });
  }
  return offsets;
}

/**
 * Computes a `{ sOff, tOff }` pair for every edge in `edges`, fanning edges
 * that share a source (or a target) apart. `edges` order is the fan-out
 * order within a shared endpoint's group, so callers should pass a stable,
 * deterministic edge list (e.g. `ResolvedTopology.connections`' own
 * declaration order).
 */
export function fanEdges(edges: readonly { from: string; to: string }[]): FanOffset[] {
  const bySource = new Map<string, number[]>();
  const byTarget = new Map<string, number[]>();

  edges.forEach((edge, index) => {
    const sourceGroup = bySource.get(edge.from) ?? [];
    sourceGroup.push(index);
    bySource.set(edge.from, sourceGroup);

    const targetGroup = byTarget.get(edge.to) ?? [];
    targetGroup.push(index);
    byTarget.set(edge.to, targetGroup);
  });

  const sOffs = fanOffsetsFor(bySource);
  const tOffs = fanOffsetsFor(byTarget);

  return edges.map((_edge, index) => ({
    sOff: sOffs.get(index) ?? 0,
    tOff: tOffs.get(index) ?? 0,
  }));
}
