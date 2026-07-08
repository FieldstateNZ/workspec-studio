# @workspec/c4-layout

Deterministic [elkjs](https://github.com/kieler/elkjs)-based auto-layout for
[`@workspec/c4-model`](../c4-model)'s resolved C4 diagrams, with pinned-node/mixed-mode support and
`.workspec/diagrams/.layout/*.yaml` round-tripping. Pure computation over already-loaded data — no
filesystem, no DOM, no `node:` imports anywhere in this package's import graph — so it runs
identically in Node and the browser.

## Usage

```ts
import { loadC4Model, createFsSource } from '@workspec/c4-model/fs';
import { layoutModel, layoutDiagram, serialize } from '@workspec/c4-layout';

const model = await loadC4Model(createFsSource('/path/to/repo'));

// Fan out over every diagram in the model, respecting each one's own
// attached `.layout/` file.
const laidOut = await layoutModel(model);

// Or lay out a single resolved view directly.
const diagram = model.diagrams.find((d) => d.slug === 'system-context')!;
const positioned = await layoutDiagram({
  nodes: diagram.view!.nodes,
  edges: diagram.view!.edges,
  layout: diagram.layout?.data ?? null,
});

// Graduate an auto-layout result into a curated `.layout/` file.
const layout = serialize(positioned);
```

## Mixed mode: the pinning mechanism

`layoutDiagram` treats a `.layout/` file's pinned node positions as authoritative and lays out
every other node around them, collision-free. The mechanism (chosen from the three the S4 design
brief allows — interactive-mode position seeds, `elk.fixed` sub-partitioning, or post-pass
collision resolution) is **post-pass collision resolution**:

1. Every node in the view (pinned and unpinned alike) is fed to elkjs's `layered` algorithm for one
   fully-automatic pass. Pinned nodes have to stay in this graph even though their auto-computed
   position will be discarded — removing them would disconnect any edge touching them (elkjs's
   layered algorithm rejects an edge whose endpoint isn't one of its own children).
2. Pinned nodes' final rects are then set to their exact `.layout/` coordinates (width/height too,
   falling back to the default 300x110 footprint when the pin omits them) — never elkjs's guess.
3. Unpinned nodes are placed in deterministic sorted-`nodeId` order, starting from elkjs's auto
   position for that node and nudged along the axis perpendicular to the flow direction (Y for
   `'LR'`, X for `'TB'`) only as far as needed to clear every rect already placed — every pin, plus
   every unpinned node placed earlier in the same pass.

Full-auto (no `.layout/` file) and full-manual (every node pinned) are not special-cased — they're
the same function with the `pins` map empty or complete, respectively. There is no branch in
`layoutDiagram` or `resolveNodeRects` that distinguishes "some nodes pinned" from "no nodes pinned"
from "all nodes pinned".

Two consequences of "pins are authoritative" worth stating explicitly:

- **The zero-overlap guarantee excludes pin-vs-pin.** Pins are never moved — not by auto-layout,
  and not off _each other_. A `.layout/` file that pins two nodes onto overlapping (even identical)
  coordinates is reproduced exactly as authored; only nodes this package places itself (the
  unpinned ones) are guaranteed to clear everything else. A curated layout colliding with itself is
  the author's statement to keep, not a defect for the layout engine to silently "fix".
- **Pinning the same node under two keys is last-writer-wins.** A `.layout/` file may pin the
  system node under the literal `__system__` alias or under the system's real slug — both translate
  to the same resolved node (see `src/model/resolve-system-alias-ref.ts`). If one file pins _both_,
  the entry appearing later in the file wins, with no diagnostic (`@workspec/c4-model`'s orphan-pin
  check sees both keys as valid, and this package doesn't re-diagnose `.layout/` contents).

This mechanism trades a small amount of layout quality (the auto pass doesn't know a pinned node's
_exact_ coordinates when deciding where its neighbours go, only that it's present and how large it
is) for a guarantee that's otherwise very hard to get from elkjs directly: elkjs's own "keep this
node where it is" primitives (`elk.noLayout`, the `fixed` algorithm) are built for _nested_ graphs
(a pre-laid-out subgraph embedded in a larger one), not for "some nodes in this flat graph are
pinned, others aren't" — see the next section for what happened when this package tried them.

## Why not ELK for edge routing

Node placement genuinely benefits from elkjs's layered algorithm (rank assignment, crossing
minimization, spacing). Edge routing does not go through elkjs at all — edges are routed by a small,
pure "elbow" router (`src/routing/elbow-route.ts`) operating directly on the _final_ node rects
(after pinning + nudging), for two reasons:

- elkjs's edge routes are only trustworthy for a graph it placed every node in itself. Once a
  node's position is overridden by a pin or moved by the collision-avoidance nudge, any route elkjs
  computed during the auto pass no longer connects to where that node actually ended up.
- elkjs's `fixed` algorithm — the obvious-looking "keep positions, just route edges" option — turns
  out to require every edge already have a routed section (`IllegalArgumentException: The edge needs
to have exactly one edge section. Found: 0` for a plain unrouted edge); it's designed to preserve a
  previously-computed layout, not to route a fresh one over externally-supplied positions.

A route computed straight from the final rects is simple, always geometrically consistent with the
nodes it connects, and identical whether every node is pinned, none are, or anything in between —
matching Enterprise's own architecture, where edge geometry is "fully derived each render" rather
than persisted or computed by the node-layout engine itself (see the conformance survey).

## Dangling edges

An edge `@workspec/c4-model` flagged `dangling: true` (an unresolved `from`/`to` — including the
documented no-system case, where a diagram references `__system__` but the tree has no
`system/*.yaml` at all) has no valid node id to route between. `layoutDiagram` drops these edges
before layout runs; they never appear in a `PositionedDiagram`'s `edges`, and this is never an error
— skipping them is the documented behaviour.

## Determinism

Same input, same output coordinates, forever:

- `nodes`/`edges` are sorted (by `nodeId` / the `"<from>-><to>"` edge key) before anything is handed
  to elkjs, using ordinal string comparison (never `localeCompare`, whose result depends on the
  runtime's default locale).
- Every elkjs layout option this package uses is fixed explicitly (`src/elk/elk-layout-options.ts`)
  — never left at "whatever elkjs currently defaults to", since a future elkjs upgrade changing a
  default would otherwise silently reshuffle every previously-committed `.layout/` file.
- The pinning nudge pass and the elbow router are both pure functions with no random or
  time-based input.
- `runAutoLayout` constructs a fresh `ELK` instance on every call — there is no shared mutable state
  between calls or between packages, which is what the "across separate ELK instances" determinism
  test actually proves.

## elkjs build variant

This package imports `elkjs/lib/elk.bundled.js` (never `elk-api.js` + a `workerUrl`) — the plain,
non-web-worker build, per the S4 design brief. elkjs's web-worker path needs the optional
`web-worker` npm package (unavailable in a browser worker context anyway, and not a dependency of
this package), and a single per-call layout of a few dozen nodes doesn't justify off-thread
execution.
