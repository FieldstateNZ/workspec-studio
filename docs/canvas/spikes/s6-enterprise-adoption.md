# S6 — Enterprise re-adoption spike report (#122)

> **CORRECTION (post-spike, ADR
> [I](../decisions/i-fold-canvas-c4-into-c4-ui.md)):** this spike evaluated enterprise adopting
> the two raw layer packages (`@workspec/canvas` + `@workspec/canvas-c4`) directly. The owner
> ruled the actual consumption model is enterprise mounting the **`@workspec/c4-ui` surface**
> (`C4Diagram`/`C4Explorer` + the `C4CanvasHost` bridge + the meta protocol + the status slot),
> and `@workspec/canvas-c4` was folded into `c4-ui` (as `src/c4/`, its API re-exported from the
> package index) and deleted — it was never published. Read the report with that substitution:
> every `@workspec/canvas-c4` import below is now an `@workspec/c4-ui` import. The **contract
> verification stands** — the host bridge mapping (§3), the meta protocol, and the capability
> wiring (§2) remain valid because `c4-ui` passes those contracts through (and exports them)
> unchanged. The **store-shim path (§1) applies only to enterprise's non-C4 canvas surfaces**
> (the standalone whiteboard/workflow/prototype pages that mount `@workspec/canvas` directly);
> enterprise's C4 canvases mount the `c4-ui` surface instead of composing the layer by hand.

**Verdict: YES — enterprise can adopt `@workspec/canvas` + `@workspec/canvas-c4` without forking either package.**
Zero package-side changes are *required* for functional adoption. Three small package changes are *recommended* (numbered gap list below) — one visual-parity data addition (the node-kind spec-defaults, answering the ledger question), one type-level ergonomic fix, one nice-to-have projection option. Everything else is enterprise-side, mostly mechanical, and is demonstrated in the draft diff.

**Method**: static verification only. The packages are unpublished (S5 pending) and cross-repo workspace linking isn't possible, so `pnpm install`/`tsc` could not run in the scratch worktree. Every claim below is grounded in a read-through of both contract surfaces: the packages on branch `claude/workspec-c4-alignment-647ca3` (`packages/canvas`, `packages/canvas-c4`) and the enterprise repo at detached `d4a4c1d3`.

**Draft diff**: `s6-adoption-draft.patch` beside this report (1,383 lines, 10 files: −735/+510 — the enterprise canvas gets *smaller* on adoption because the 704-line store collapses to an 89-line shim). Zero commits anywhere; the enterprise main checkout was never touched (verification transcript at the end).

---

## 1. Mount survey + the `useCanvasStore` shim (task 1)

Enterprise mounts `<Canvas>` in 9 files (ProjectGraphCanvas, ArchitectureCanvasView, and 7 standalone pages: topology, prototype, feature-view, v2-discovery, workflows-workspace, persona-view, domain-view). All of them share ONE module-level store — the singleton is load-bearing app architecture, not an accident.

**Shim design** (drafted as `src/canvas/store.ts`, 89 lines): keep a module-level singleton `canvasInstance = createCanvasStore({ persistenceKey: 'workspec-canvas-v1', kindResolver: kindOfShape })` and bind the compat hook to it **directly with zustand's `useStore`**, *not* the package's context hook:

- `useCanvasStore(selector)` / `useCanvasStore()` → `useStore(canvasInstance, selector)` — identical call signature, works with or without a provider;
- `useCanvasStore.getState/.setState/.subscribe` → statics delegating to the instance.

`<CanvasProvider store={canvasInstance}>` is added once per `<Canvas>` mount (draft shows ProjectGraphCanvas — a 2-line wrap; the other 8 mounts are the same 2 lines each). It is needed only by the package's own components; external panels reading the shim need no provider.

**All 18 external import files verified call-by-call — NONE break.** Usage forms found: reactive selectors (all 18 files), `getState()` imperative (12 files incl. useC4Diagram/useTopology/workflows-workspace), `setState()` (useTopology ×2), `subscribe()` (useC4Diagram ×2, useTopology, workflows-workspace, useCanvasSync). All three forms are preserved verbatim by the shim. The only call-site change in the whole design is *inside the canvas tree*: `ScreenShapeComponent` (the sole consumer of the dropped `selectedElement` store slice) swaps to the new `screen-elements.ts` side module — see §5.

Known trade-off: the shim forbids two canvases on one page. Enterprise has none today; if that ever changes, the shim's singleton dissolves file-by-file into `useCanvasInstance()` — the package already supports it.

## 2. Enterprise-only shapes as ShapeModules (task 2)

The package `ShapeUtil` is a strict structural **superset** of the enterprise interface (same 7 required members, plus 8 optional capabilities). Every enterprise util re-registers as-is; drafted:

- **artifactcard** — bare `registerModule` with ZERO capability additions (default AABB selection — it was never on the SelectionLayer opt-out list; not connectable; not routed). Only its type import changes.
- **atlassuggestion** — same; its accept/dismiss buttons already delete via `deleteShapes` and ride the false→local host fallback.
- Plus the full register list (`register-enterprise-shapes.ts`): workflownode gets `isConnectable` + `connectorKey: stateKey` + `routedEdges` + `isRouteObstacle`; diagram-node the same; diagram-group/groupframe get `isGroupContainer`/`containerTitle`; screen + flowarrow get `selfRendersSelection` (they were on the enterprise opt-out list).

**Capability gaps found: none.** The S2 capability set (`selfRendersSelection`, `isConnectable`/`connectorKey`, `routedEdges`/`isRouteObstacle`, `isGroupContainer`/`containerTitle`, `isContextMenuSurface`) covers every hard-coded per-type list the enterprise chrome carried. The package even keeps the legacy type-name fallbacks (c4node/workflownode/diagram-node) so bare re-registration works before capabilities are wired.

## 3. `useC4Diagram` bridge → `C4CanvasHost` (task 3)

Method-by-method mapping of the enterprise `C4Bridge` (12 methods) onto the package host contract — **every method exists, same signature, same semantics**:

| Enterprise `c4Bridge` | Package home | Delta |
|---|---|---|
| `createEdge(from,to)` | `CanvasHost.createEdge(fromKey,toKey)` | none — keys are slugs via `connectorKey` |
| `placeNode(nodeType,pos)` | `CanvasHost.placeNode` | none (host mints the `meta.pending` local node, as today) |
| `commitNewNode(nodeType,name,pos)` | `C4CanvasHost.commitNewNode` | none |
| `renameNode(slug,name)` | `C4CanvasHost.renameNode` | none (optimistic-local first, then notify) |
| `renameShape(id,label): boolean` | `CanvasHost.renameShape` | none — true/false gate intact |
| `moveToContainer(ids,cid): boolean` | `CanvasHost.moveToContainer` | none |
| `renameEdge(from,to,label)` | `CanvasHost.renameEdge` | none |
| `deleteShapes(ids): boolean` | `CanvasHost.deleteShapes` | none — false→local fallback contract-tested in the package |
| `drillDown(slug)` | `C4CanvasHost.drillDown` | none |
| `autoLayout()` | `CanvasHost.autoLayout` | none |
| `enterRoom?(slug,label,type)` | `C4CanvasHost.enterRoom` | none (optional, studio never installs) |
| `toggleReworking?(id,current)` | `C4CanvasHost.toggleReworking` | none |
| — | `C4CanvasHost.openElementEditor` | **new**: replaces the `workspec:open-c4-element-editor` window CustomEvent (#119 declared deviation). Draft keeps the event as enterprise-internal transport, dispatched from the callback. |

Installation changes from module-level `setC4Bridge({...})` to `canvasInstance.host = {...}` with `host = {}` teardown — drafted in `useC4Diagram.ts`.

**Contract surface sync/atlas depend on — all verified present with matching semantics:**
- `meta.ephemeral` — engine contract, `exportSnapshot()` excludes flagged shapes (README-documented, contract-tested). Same filter enterprise's local-persist + view-exit hygiene rely on.
- `_setShapesRaw(shapes)` — public API, history-free replace. Used by enterprise in 7 places (reflow, relayout, optimistic edge/node, view-exit, sync merge) — all compatible.
- `_executeCommand(cmd)` — public; powers the screen-element side module.
- `exportSnapshot()/loadSnapshot()` — `{version:1, camera, shapes}`, loadSnapshot resets history+selection (enterprise relies on the stale-undo drop on projection reload — preserved).
- false→local fallback — verbatim contract in the package README and `c4-host.test.tsx`.
- Connector dual identity — package `ConnectorShape` keeps BOTH `sourceShapeId/targetShapeId` (ShapeId) and `edgeFrom/edgeTo` (slug), and `slugToShapeId` still aliases `'__system__'` to the system node. `laneOffset`/`fanRole`/`cardinality` all survive.

**Dropped/renamed things enterprise must absorb (all drafted or noted):**
1. `buildShapes(detail, lens, drillable, boundary, drafted, reworking)` → `buildC4Shapes(resolved, options)`: input type changes from `DiagramDetailIn` to studio `ResolvedDiagram`. Drafted a 90-line adapter (`c4/resolvedAdapter.ts`): field mapping is near-isomorphic (`id→nodeId`, `type→kind`, `label→title`); `validationErrors`/`artifactRefId` layer onto `meta` via post-pass (the documented `C4NodeMeta` protocol).
2. The dagre-fresh / seat-incremental position fallback that lived *inside* enterprise `buildShapes` is not in the package (positions are injectable by design; studio uses elk). Enterprise keeps its dagre and must precompute the `options.positions` map — the old fallback code moves into the adapter. The draft passes saved positions only; porting the fallback is a marked TODO of the real adoption (~40 lines moved, not written new).
3. `setC4Bridge`/`getC4Bridge` module functions → `instance.host` (mechanical).
4. Screen-element sub-selection dropped from the store (deliberate S1 cut) — see §5.
5. `meta.dimmed` is now host-only (matches enterprise reality — its projection stopped setting it in d783789e; the card still renders it).

## 4. The node-kind defaults question (ledger comment — the answer)

**Which non-core kinds does enterprise actually render on C4 canvases?**

- **`entity`, `note`, `decision`, `question`, `user-requirement`, `system-requirement` — YES, all reachable and rendered today.** Evidence chain: the server's `get-diagram.ts` resolves a bare-slug node's type from the **artifact row's type** (`type: ref.type ?? n?.type`, `artifacts/api-server/src/services/diagrams/get-diagram.ts:261`), and the attach route (`attach-artifact.ts`) accepts ANY artifact by slug with only a type *hint* — so agents/MCP/repo edits and cross-artifact attaches put these kinds on C4 diagrams. The client is explicitly prepared for them: `c4-node-types.ts` carries dedicated accents AND icons for all six (`entity` hsl(264…)/Table, `note` hsl(45…)/StickyNote, `decision` hsl(280…)/Lightbulb, `question` hsl(200…)/HelpCircle, `user-requirement` hsl(20…)/User, `system-requirement` hsl(0…)/CheckSquare), and `labelForType` has an explicit `entity` case. The server-compiled spec covers only the 12 core kinds (`lib/yaml-schemas/src/spec.ts` `DEFAULT_ELEMENT_STYLES`), so today these six style through the **client-side** `NODE_TYPE_COLOURS` fallback — precisely the map the package deliberately didn't port.
- **`participant` — NO, dead data on C4 canvases.** It appears ONLY in the colour/icon/label maps; nothing in `src/` mints a c4node with it. (The `participant` in the server's `diagram-dsl.ts` belongs to the sequence-diagram family, which renders via the enterprise-stays `diagram-node` shape, not the C4 canvas.)
- Level nuance: at the **container** level both projections (enterprise and package, verified line-by-line) filter nodes to actors/externals/system + the lens-inside set, so non-core kinds are dropped there. They render at **context/component/code** levels and non-container diagrams — same behaviour both sides, no delta.

**Consequence on adoption**: with the package as-is, those six kinds fall to `UNKNOWN_ELEMENT_STYLE` — gray `var(--ink-fade)` accent + generic box icon (also note the *unknown*-kind fallback delta: enterprise fell back to the system-blue accent, the package to gray). That is a visible visual regression on real enterprise projects.

**Recommendation: the package's `spec-defaults.ts` should grow the six entries** (option (a) from the ledger comment), NOT enterprise-registered modules — these are c4node *kinds*, not shape *types*; the module registry keys on `shape.type`, so "own-styled modules" is the wrong-shaped fix. `spec-defaults.ts` is already the documented enterprise-conformance-data exemption file, and the canonical copy. Icon keys all exist in the package's `ICON_BY_KEY` already (table, sticky-note, lightbulb, help-circle, user, check-square). Token availability in `@workspec/design@0.1.0-alpha.1`: `--type-userreq` and `--type-q` exist for user-requirement/question; entity/note/decision/system-requirement have no tokens yet → either add four tokens to the design package (Decision E precedent) or land the enterprise literal hues in the exempt data file now and tokenise later. Skip `participant` (dead) or include it for map parity at zero cost.

## 5. Version / toolchain (task 5)

| Axis | Finding | Verdict |
|---|---|---|
| React | Enterprise catalog pins `react: 19.1.0` exact; package peers `^18.3.0 \|\| ^19.0.0` | **OK** — satisfied; `@types/react` ^19.2 fine |
| zustand | Enterprise `^4.5.7`; package carries zustand `^5.0.8` as a regular **dependency** (not peer) | **OK with one bump**: enterprise's own `create` consumers are 4 files — canvas `store.ts` + `useCanvasHover.ts` (both DELETED on adoption; package provides both) and `use-active-c4-diagram.ts` + `use-topology-panel.ts` (tiny UI stores; v5 keeps `create`, no API change for their usage — a version bump, not a migration). Drafted `zustand: ^5.0.8` in package.json. Not bumping would work too (two zustand copies, no shared state) but is pointless bloat. |
| zod | Enterprise `zod/v4` subpath in 2 canvas files (both stay enterprise: `diagram/model.ts`, serverDoc); package uses plain `'zod'` ^4.4.3 as its own dep | **OK** — no interaction; house rule (all v4) satisfied both sides |
| Tailwind | Enterprise is v4.1 CSS-first **with** app-global preflight; package CSS is preflight-free, scoped `.wsc-root` | **OK** — a preflight-free package layers safely into a preflight app. Adoption task: delete the enterprise `index.css` canvas/`.c4-el` blocks (~lines 225–267) and import `@workspec/canvas/styles.css` + `@workspec/canvas-c4/styles.css`. |
| Design tokens | Package CSS resolves from `@workspec/design` tokens (`--el-*`, `--el-tint-*`, `--sticky-*`, …); enterprise defines its own console theme and does NOT depend on the design package | **The real toolchain work**: enterprise's tokens are the values the design package externalized, but names must be verified 1:1 — either add the `@workspec/design` token import to the enterprise entry CSS or alias the handful of `--el-tint-*`/`--sticky-*` names. Budget a token-audit pass + screenshot check. |
| dagre | stays enterprise-local inside `useC4Diagram` (Decision A) | OK |

## 6. Atlas / sync integration (task 6)

- **`useCanvasSync`** uses `getState()` (loadSnapshot, `_setShapesRaw`, `exportSnapshot`, select, setEditing, shapes, selectedIds, editingId) + `subscribe()`. Every one exists on the package store with identical semantics; the merge path's ephemeral-preserving logic maps 1:1 onto the package's `meta.ephemeral` contract. **Zero changes needed** beyond the shim import.
- **`useAtlasCeremony`** uses `createShape` (ephemeral suggestion card), `markRecent`, `deleteShapes`, shape reads. All present; `markRecent`/`highlight`/`recentIds` were ported field-for-field. Its `deleteShapes` on a suggestion while the C4 host is installed still lands locally (host returns false for non-C4 ids) — fallback contract preserved. **Zero changes.**
- **Instance-scoping does not break their module-level access patterns** — both are React hooks running under the singleton shim; `subscribe`/`getState` statics behave exactly as the retired module hook. The one thing that would break them — a second instance on the page — is excluded by the shim design (§1).
- Note: package `subscribe` (zustand v5 vanilla) is single-argument-listener `(state, prevState)` — same as v4's non-selector subscribe that enterprise uses everywhere. No `subscribeWithSelector` usage exists in enterprise. Verified.

## 7. Package API gaps (numbered; each: what / why / proposed change)

1. **Node-kind style defaults for enterprise artifact kinds.** What: `canvas-c4/src/style/spec-defaults.ts` lacks entries for `entity`, `note`, `decision`, `question`, `user-requirement`, `system-requirement`. Why: enterprise demonstrably renders all six on C4 canvases (evidence in §4) and they'd regress to gray unknown styling. Proposed: add the six entries to `DEFAULT_ELEMENT_STYLES` (canonical copy) using `--type-userreq`/`--type-q` where tokens exist and the enterprise literal hues (exempt data file) for the other four, with matching `ICON_BY_KEY` keys (all already present); optionally add 4 new `--type-*` tokens to `@workspec/design` in its next release. ~20 lines + token-audit allowlist untouched (file already exempt).
2. **`buildC4Shapes` input type is wider than what it reads.** What: it requires a full `ResolvedDiagram` but only reads `type`/`view`/`lensViews`; hosts must synthesize `raw`, `slug`, `path`, `description`, `layout`. Why: the enterprise adapter (and any non-studio host) fabricates dead fields, and `raw: Diagram` forces a bogus cast. Proposed: accept `Pick<ResolvedDiagram, 'type' | 'view' | 'lensViews'>` (or a named `C4ProjectionInput`) — type-level only, zero runtime change, studio callers unaffected.
3. **(Nice-to-have) per-node meta annotation option on `BuildC4ShapesOptions`.** What: an optional `nodeMeta?: (nodeId: string) => Record<string, unknown> | undefined` merged into each minted shape's `meta`. Why: the documented enterprise pattern for `validationErrors`/`artifactRefId` is a post-pass that clones the whole shape record right after projection — workable (drafted) but wasteful and easy to get wrong re: `meta` spread order. Proposed: one option + spread in the mint loop (~6 lines), keeping `C4NodeMeta` as the documented vocabulary.

Explicitly **not** gaps (checked and fine): the singleton compat pattern (zustand's public `useStore` covers it — no package helper needed); screen-element sub-selection (deliberate scope cut; clean enterprise side-module over public seams, drafted); `openElementEditor` (an upgrade enterprise adapts to trivially); the unknown-kind gray fallback (defensible design change — flag it in the adoption PR as a deliberate delta, or fold into gap 1's review).

## 8. Estimated adoption effort

- **Mechanical core** (drafted here): store shim, shape/tool registration, 9 provider wraps, host install, projection adapter + dagre-fallback move, `types.ts` split (re-export base types from the package, keep enterprise shape defs), delete retired files (store, registry, c4Bridge, hooks/components/tools the package replaced): **2–4 dev-days**.
- **Styling/token wiring + visual QA**: design-token import/alias audit, delete duplicated CSS layers, screenshot pass across the 9 canvas surfaces, both themes: **2–3 dev-days**.
- **Prototype-family migration** (screen-elements side module + its 2–3 consumers): **0.5–1 day**.
- **Risk buffer** for the not-strict→strict friction at the seam files and the first real `tsc` run (this spike could not typecheck): **1–2 days**.

**Total: roughly 1–1.5 weeks of one developer**, gated on the packages being published (S5) and on gap 1 landing if visual parity for artifact-kind nodes is required on day one.

## 9. Hygiene

- Draft lives ONLY in the detached scratch worktree (`scratchpad/ent-spike`, HEAD `d4a4c1d3`); diff extracted to `s6-adoption-draft.patch`; worktree removed after extraction.
- Zero commits on any branch of either repo; the enterprise main checkout (`/Users/brettsmith/GitHub/workspec`, mid-flight on `fix/setup-dev-bypass-and-per-edition-gitdir` with a dirty tree) was never written to — `git status --porcelain` byte-identical before/after, `git worktree list` restored to its prior set.
