# B — Two packages: `@workspec/canvas` + `@workspec/canvas-c4`

- **Status:** Superseded by [I — fold `canvas-c4` into `c4-ui`](./i-fold-canvas-c4-into-c4-ui.md)
  (the `@workspec/canvas` half of this decision stands; the separate `@workspec/canvas-c4`
  package does not — the C4 layer now lives inside `@workspec/c4-ui`, as a folder, and
  `canvas-c4` was retired before it was ever published)
- **Deciders:** Fieldstate Dev Lead
- **Decided:** 2026-08-02
- **Format note:** authored as a **markdown ADR**, not a `*.decision.yaml`, per the repo's
  decision-format rule ([`docs/decisions/workspec-tech-spec-v0.1.md`](../../decisions/workspec-tech-spec-v0.1.md)
  §6): the costed format fits when every compared option carries a positive, graded cost/effort;
  this is a scope/constraint-driven call ratified directly in the epic body, not a weighted cost
  comparison. Ratified in [Epic #116](https://github.com/FieldstateNZ/workspec-studio/issues/116)
  as decision **B**; recorded per [D0 #123](https://github.com/FieldstateNZ/workspec-studio/issues/123).

## Context

The enterprise canvas engine (`workspec/artifacts/workspec/src/canvas`, ~21k LOC tree; ~6–8k LOC
needed for C4 parity) is being extracted into shared open-source packages. The extraction needs a
package boundary between the generic whiteboard/canvas engine and the C4-specific projection that
sits on top of it, so that C4 is a *consumer* of an open extension API rather than something the
engine has baked-in knowledge of.

## Options considered

- **Two packages: `@workspec/canvas` + `@workspec/canvas-c4`** (chosen). `@workspec/canvas` is the
  generic engine: the store factory (zustand v5 vanilla store + context provider, replacing the
  enterprise module singleton), `<Canvas>`, camera/pointer/keyboard/hover/text-editing hooks,
  geometry/transforms/history/align utils, an open `ShapeModule` registry, a `Tool` registry, the
  `CanvasHost` seam, `CanvasSpecContext`, and the whiteboard base shapes (sticky/text/draw/image)
  plus the orthogonal connector family. `@workspec/canvas-c4` builds C4 as a layer on top —
  `buildC4Shapes(resolved, layout, spec)` (ported `c4/projectModel.ts`), the `c4node`/`c4boundary`
  shape modules, and `C4CanvasHost` — depending on `canvas` + `c4-model` (types) + `c4-schema`.
- **One combined package** with C4 support baked directly into the canvas engine. Rejected: this
  is explicitly what the split avoids — the epic frames `@workspec/canvas-c4` as "C4 as a layer,
  not baked in," so that other domains (whiteboard-only consumers, and eventually other diagram
  kinds) can depend on `@workspec/canvas` alone without carrying C4's schema/model/layout
  dependencies, and so the open `ShapeModule`/`Tool` registries stay genuinely open rather than
  C4-aware by construction.

## Decision

The extraction ships as two packages: `@workspec/canvas` (the generic, open engine) and
`@workspec/canvas-c4` (C4 as a validating consumer of the engine's open extension API — shape
registry, tool registry, `CanvasHost` seam). `@workspec/c4-ui` remains the composition facade on
top of both (decision **D**).

## Consequences

- **+** `@workspec/canvas` stays genuinely reusable: the whiteboard base shapes and connector
  family have no C4 knowledge, and any future non-C4 diagram domain can depend on it directly.
- **+** C4-specific code (`buildC4Shapes`, `c4node`/`c4boundary`, `C4CanvasHost`) is proven against
  the same open registries a third-party extension would use, which is the real test of whether
  the extension API is actually open.
- **−** Two packages to version, build, and publish instead of one, with a strict one-way
  dependency (`canvas-c4` → `canvas` + `c4-model` + `c4-schema`) that must be kept acyclic.
- **−** The split adds to the studio-strictness-churn risk flagged in the epic (enterprise tsconfig
  is non-strict; studio is maximal-strict TS6 + `no-explicit-any`) across two package boundaries
  instead of one — mitigated by piloting `store.ts` + `SelectTool.ts` first (S1) to calibrate.
- **−** Both packages ride the same publish/site coupling risk (`link-workspace-packages=false`):
  a temporary workspace-devDep exception is needed for each, publish alpha, then re-pin.
