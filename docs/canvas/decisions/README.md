# Canvas extraction — decision artifacts (D0)

The ratified decisions from [Epic #116 — Canvas v0.1](https://github.com/FieldstateNZ/workspec-studio/issues/116),
recorded as decision artifacts per [D0 #123](https://github.com/FieldstateNZ/workspec-studio/issues/123).

All nine are **markdown ADRs**, not `*.decision.yaml`: per the decision-format rule in
[`docs/decisions/workspec-tech-spec-v0.1.md`](../../decisions/workspec-tech-spec-v0.1.md) §6, the
costed YAML format fits a decision when every compared option carries a positive, graded
cost/effort (the shape `docs/decisions/`'s own D1/D4/D5 use, and topology's
[`aspire-publishing-strategy`](../../../.workspec/decisions/aspire-publishing-strategy.yaml) used,
backed by empirical spike scores). These nine are scope/constraint-driven calls ratified directly
in the epic body — none carry a graded cost/effort comparison across options — so they follow the
same house convention topology's own D2/D3/D6-equivalents would use: prose ADRs with Context /
Options considered / Decision / Consequences.

| # | Decision | Chosen | Record |
| --- | --- | --- | --- |
| **A** | Edge-rendering approach | elk positions kept; ported orthogonal router draws edges (not a dagre port) | [`a-elk-positions-ported-orthogonal-router.md`](./a-elk-positions-ported-orthogonal-router.md) |
| **B** | Package split | Two packages — `@workspec/canvas` (generic engine) + `@workspec/canvas-c4` (C4 as a layer) | [`b-canvas-canvas-c4-package-split.md`](./b-canvas-canvas-c4-package-split.md) |
| **C** | Store library/version | Zustand v5, adopted during the singleton→factory rewrite | [`c-zustand-v5.md`](./c-zustand-v5.md) |
| **D** | `c4-ui`'s role | Retained as the composition facade; MF contract + site pins survive with an alpha bump | [`d-c4-ui-facade-retained.md`](./d-c4-ui-facade-retained.md) |
| **E** | Design-token gaps | Documented, test-scoped local-token exemption in v1; `@workspec/design` absorbs later | [`e-local-token-exemption.md`](./e-local-token-exemption.md) |
| **F** | `renderSvg` geometry | Regenerated on the shared geometry (router + node modules); invariant preserved | [`f-render-svg-shared-geometry.md`](./f-render-svg-shared-geometry.md) |
| **G** | OSS v1 shape scope | C4 set + whiteboard base (sticky/text/draw/image) + connector; other shapes stay enterprise | [`g-oss-v1-shape-scope.md`](./g-oss-v1-shape-scope.md) |
| **H** | `C4CanvasHost` bridge | Mirrors the full 12-method enterprise bridge, everything optional | [`h-c4-canvas-host-full-mirror.md`](./h-c4-canvas-host-full-mirror.md) |
| **Seq.** | Refactor sequencing | No in-enterprise refactor PR; factory refactor lands during the port, S6 spikes re-adoption | [`seq-no-enterprise-refactor-pr.md`](./seq-no-enterprise-refactor-pr.md) |

These are not discovered or validated by `workspec-decisions validate` (that CLI only globs
`.workspec/decisions/*.yaml` / `.workspec/catalogs/*.yaml`, per `@workspec/decision-schema`'s
`typeDirectoryFor`) — there is no schema for prose ADRs, matching how `docs/decisions/d2`, `d3`,
and `d6` are likewise unvalidated markdown records of the decision-studio project's own
constraint-driven calls.
