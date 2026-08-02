# @workspec/canvas-c4

C4 semantics as a layer on the [`@workspec/canvas`](../canvas) engine — ported from the WorkSpec
enterprise C4 canvas (epic #116, S3 #119). The engine stays generic; this package supplies:

- **`buildC4Shapes(resolved, options)`** — the pure `ResolvedDiagram` → canvas-shape projection
  (deterministic `c4n_`/`c4e_` ids, container-level lens partition, lane-offset/fan-role
  precompute, outside < boundary < connectors < inside z-banding, derived boundary panel,
  `meta.ephemeral` protocol), plus `fitCamera`.
- **`projectC4Diagram(resolved, options)`** — the one-call pipeline: elk positions
  (`@workspec/c4-layout` — `.layout/` pins exact, auto nodes deterministic; injectable via
  `layoutFn`) composed with the engine's orthogonal edge router at render time. `.layout` edge
  waypoints are advisory (never read).
- **c4node / c4boundary shape modules** (`registerC4(instance)`) — the enterprise card chrome:
  kind-accented badged cards (4px accent left border, giant watermark icon, eyebrow/title/
  description stack, DRAFT chip, rework halo, validity markers, drill/ROOM buttons), cylinder/
  pill/hexagon silhouettes, the pointer-transparent boundary panel. Capabilities wired:
  `selfRendersSelection`, `isConnectable` + `connectorKey` (slug), `routedEdges` +
  `isRouteObstacle` (c4node), `isContextMenuSurface` (c4boundary).
- **`C4CanvasHost`** — the full enterprise bridge contract on `instance.host` (commitNewNode,
  renameNode, drillDown, enterRoom, toggleReworking, openElementEditor + the core CanvasHost
  methods). All optional; components are **optimistic-local first** — a missing callback means the
  edit stays local (contract-tested).
- **`C4NodeStatusSlot`** — a render-prop context for host status chrome in the card's eyebrow row
  (where enterprise rendered its PR-overlay chips).
- **`buildCanvasSpec(spec)`** — compile a `spec.yaml` into the engine's `CanvasSpecContext` value
  via the reconciled default style tables (`style/spec-defaults.ts`, the canonical copy — accents
  are `@workspec/design` tokens).
- **`C4Demo`** — the fixture story: one card per kind + boundary + categorised edges, light/dark.

## Usage

```tsx
import { Canvas, CanvasProvider, CanvasSpecContext, createCanvasStore } from '@workspec/canvas';
import { buildCanvasSpec, projectC4Diagram, registerC4 } from '@workspec/canvas-c4';
import '@workspec/canvas/styles.css';
import '@workspec/canvas-c4/styles.css';

const instance = createCanvasStore();
registerC4(instance);
const projection = await projectC4Diagram(resolvedDiagram, { lens: 'deployment' });
instance.getState()._setShapesRaw(projection.shapes);
instance.host = { drillDown, commitNewNode /* … C4CanvasHost */ };
// <CanvasProvider store={instance}>
//   <CanvasSpecContext.Provider value={buildCanvasSpec(spec)}>
//     <Canvas backgroundVariant="dots" />
```

## Styling

`dist/styles.css` carries the `.c4-el` derivation layer (accent → surface/border/eyebrow/
watermark, dark +22% white lift, `data-scope="focus"` deepening). The light/dark percentages come
from `@workspec/design`'s shared `--el-tint-*` tokens — one encoding with c4-ui's `.c4-node` and
Decisions' option-card. Colour-value exceptions (all documented in-file, enforced by
`token-audit.test.ts`): `style/spec-defaults.ts` (enterprise conformance data),
`style/status-colors.ts` (rework orange / validity emerald), `style/local-tokens.css`
(`--c4-el-fallback`).

## meta protocol

Normative (`C4NodeMeta` in `src/c4-types.ts` is the typed contract):

- **Projection-set** (never write these from a host): `meta.ephemeral` (every projected shape —
  the engine's `exportSnapshot` filters them, see the `@workspec/canvas` README),
  `meta.slug` (the node's model identity), `meta.elementSlug` (the resolved ELEMENT slug when it
  differs from the nodeId — fat/aliased nodes), `meta.inBoundary` (tags contained nodes so a
  host's live boundary reflow can recompute the panel from its contents), and the carried-through
  Studio extras `meta.technology` / `meta.tags` / `meta.injected` / `meta.dangling`.
- **Host-set**: `meta.pending` (a locally-created node not yet named/persisted — drives the
  inline name editor + `commitNewNode`), `meta.dimmed` (the spotlight flag: the current
  enterprise projection never sets it, but the card still renders it — grayscale + brightness
  drop — so hosts can re-enable spotlighting by writing it), `meta.validationErrors` /
  `meta.artifactRefId` (enterprise-host artifact data the studio `ResolvedDiagram` doesn't carry;
  drives the validity markers + `openElementEditor`).
