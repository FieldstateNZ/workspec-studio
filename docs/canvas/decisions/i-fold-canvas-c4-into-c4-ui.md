# I — Fold `@workspec/canvas-c4` into `@workspec/c4-ui` (one shared engine package, C4 semantics in the C4 surface)

- **Status:** Accepted (supersedes the `canvas-c4` half of
  [B — package split](./b-canvas-canvas-c4-package-split.md))
- **Deciders:** Brett (owner)
- **Decided:** 2026-08-02
- **Format note:** authored as a **markdown ADR**, not a `*.decision.yaml`, per the repo's
  decision-format rule ([`docs/decisions/workspec-tech-spec-v0.1.md`](../../decisions/workspec-tech-spec-v0.1.md)
  §6): an owner-ruled scope/constraint call, not a weighted cost comparison. Recorded alongside
  the D0 set ([#123](https://github.com/FieldstateNZ/workspec-studio/issues/123)).

## Context

The canvas extraction (epic #116) shipped a three-package stack: `@workspec/canvas` (generic
engine) → `@workspec/canvas-c4` (C4 semantics as a layer) → `@workspec/c4-ui` (the composition
facade). The S6 enterprise re-adoption spike (#122) then evaluated enterprise adopting the two
raw layer packages directly. The owner ruled the middle package should not exist, on two
corrections to the framing:

1. **Enterprise consumes the STUDIO surface, not raw layers.** The consumption model is
   enterprise mounting `@workspec/c4-ui`'s components and contracts (`C4Diagram`/`C4Explorer`,
   the `C4CanvasHost` bridge, the meta protocol, the status slot) — not composing
   `buildC4Shapes` + shape modules from a separate semantics package. A package boundary that no
   consumer sits on is pure versioning/publishing overhead.
2. **The sprint goal is the studio matching the enterprise experience** — one C4 surface both
   the OSS studio and the enterprise app consume. Splitting that surface's own internals across
   two published names works against the goal: the C4 semantics and the C4 UI must version as
   one thing, because they ARE one thing.

`@workspec/canvas-c4` had never been published (verified E404 — no registry contract existed),
and its only importers were `c4-ui` itself, the parity harness, and the site's temporary
devDependency notice. The fold was therefore a pure in-repo move.

## Options considered

- **Fold `canvas-c4` into `c4-ui`** (chosen): the C4 layer moves to `packages/c4-ui/src/c4/`
  (projection, shape modules, host contract, layout composition, style data), keeping its
  internal structure and its `@workspec/canvas` dependency; `c4-ui`'s public index re-exports
  the layer's API so enterprise hosts get the whole C4 surface from one package.
- **Keep the three-package stack**: rejected by the owner rulings above — the middle name has no
  consumer of its own, doubles the canvas-family bootstrap/publish surface, and splits one
  versioned contract across two packages.
- **Fold the other way (canvas-c4 absorbs c4-ui)**: rejected — the facade IS the product
  surface; the semantics are its implementation detail, not the other way round.

## Decision

One shared engine package and one C4 surface package:

- **`@workspec/canvas` stays THE shared engine package** — generic, C4-free, exactly as
  decision B framed it. That half of B stands.
- **The C4 semantics become internals + public exports of `@workspec/c4-ui`** — moved to
  `packages/c4-ui/src/c4/` (projection/`project-model`, `layout`, `register-c4`, `c4-types`,
  the `c4node`/`c4boundary` shape modules, `C4NodeStatusSlot`, spec-defaults/status-colors/
  local-tokens, the demo fixture, all tests). `c4-ui`'s index exports the layer's public API
  (`buildC4Shapes`, `projectC4Diagram`, `elkC4Layout`, `labelAwareLayerSpacing`,
  `C4CanvasHost` + related types, `registerC4`, `buildCanvasSpec`, `C4NodeStatusSlot`,
  `C4NodeMeta`, the spec-defaults tables) so enterprise consumption needs only this package.
- **`@workspec/canvas-c4` is deleted** — retired unpublished; no registry name is orphaned.

## Consequences

- **+** One less published name: the bootstrap set drops from ten to **nine** (`canvas`,
  `mcp-core`, seven `topology-*`), and `canvas`'s own bootstrap tarball no longer has a
  same-sitting sibling to dangle against.
- **+** The C4 API is versioned as part of `c4-ui` — the semantics and the surface that ships
  them can never skew, and the enterprise adoption story is "depend on `@workspec/c4-ui`",
  full stop.
- **+** The S6 contract verification survives intact: the host bridge, meta protocol and
  capability wiring the spike verified are passed through (and now exported) by `c4-ui`.
- **±** The in-repo layering is preserved as FOLDERS, not packages: `src/c4/` keeps its own
  barrel (`src/c4/index.ts`), the engine ← C4 layer ← facade dependency direction is unchanged,
  and the layer's tests moved unmodified. What's lost is the *mechanical* enforcement a package
  boundary gave; discipline is now convention plus review.
- **−** `@workspec/canvas` loses its in-repo proof-by-consumer that the extension API is open
  (canvas-c4 was framed as "a validating consumer of the open registries"); that proof now
  lives in `c4-ui`'s `src/c4/` and in the enterprise shapes that will register against the same
  registries on adoption.
