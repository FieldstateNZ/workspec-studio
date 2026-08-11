# @workspec/c4-ui changelog

## 0.1.0-alpha.6 (S4 #120 + S5 #121 + the canvas-c4 fold; staged, publishes on the next tag)

**The C4 layer is folded in (ADR i — post-S6 owner ruling).** The interim `@workspec/canvas-c4`
package (never published) was folded into this package as `src/c4/` and deleted; `@workspec/canvas`
stays the one shared engine dependency. The C4 API is now **exported from `@workspec/c4-ui`** so
enterprise hosts consume the whole C4 surface from one package: `buildC4Shapes`,
`projectC4Diagram`, `elkC4Layout`, `registerC4`, `buildCanvasSpec`,
`C4CanvasHost` (+ `getC4Host`, `C4NodeMeta`, `C4NodeShape`, `C4BoundaryShape`,
`C4ValidationError`), the `c4node`/`c4boundary` shape modules and card components,
`C4NodeStatusSlot`/`useC4NodeStatus`, the C4 icon/label maps, and the `C4Demo` fixture — plus the
spec-defaults tables this package already re-exported. Zero behaviour change: the compiled
`@workspec/c4-ui/styles.css` still carries the engine layer and the `.c4-el` card derivation
(now compiled from in-package source instead of a canvas-c4 dist import), and every existing
export/prop/contract is unchanged.

S5 additions: the pre-S4 SVG renderer's dead `.c4-node*`/`.c4-canvas` chrome rules were pruned
from `styles.css` (anything still selecting against them — CSS overrides, automation — must
target the C4 layer's `.c4-el` card chrome instead; the `.c4-node` tint-derivation block itself
remains as the pinned encoding `element-tints.test.ts` verifies against `renderSvg`). READMEs
now document the recomposition contracts. Everything below landed in S4 (written when the C4
layer was the separate `@workspec/canvas-c4` package — it is now this package's `src/c4/`):

`C4Diagram` and `C4Explorer` are now facades over the shared canvas engine
(`@workspec/canvas` + the in-package C4 layer) — the enterprise C4 look on the
studio model. Props and the interaction/a11y contract are unchanged;
behavioural notes for consumers:

- **Camera replaces the stretch model.** The old `preserveAspectRatio='none'`
  viewBox stretch (which distorted diagrams to fill the container) is gone —
  diagrams render through the enterprise camera: no distortion, wheel zooms
  about the cursor, zoom clamped **0.1–4** (was 1.2ⁿ unbounded), content is
  auto-fitted (capped at 1×) on load and on every diagram/lens switch.
  **Size the mounting element**: the diagram fills its host's height (the old
  intrinsic aspect-ratio height no longer exists); unsized hosts fall back to
  a 320px minimum.
- **Enterprise chrome.** Nodes render as the enterprise HTML cards (4px accent
  left border, watermark icon, eyebrow/title/description, cylinder/pill
  silhouettes, selection ring + glow, dashed hover outline); edges render
  through the enterprise orthogonal router (rounded elbows, face-aligned
  arrowheads, lane fan-out, obstacle detours, midpoint label chips). Category
  and kind accents are unchanged (`@workspec/design` tokens).
- **One stylesheet, as before.** `@workspec/c4-ui/styles.css` now bundles the
  canvas engine layers — no new imports for consumers.
- **`renderSvg`** routes edges through the same shared router (CLI `render`,
  docs SVGs and the `c4_render` MCP tool inherit the enterprise edge look);
  output stays deterministic and self-contained. All string interpolation is
  now escaped (CodeQL `js/html-constructed-from-input` #1–#3 hardening),
  including hostile `spec.yaml` accents.
- **Low-zoom level of detail (replaces the reverted label-aware spacing).**
  An interim S4 change widened the inter-layer gap to the enterprise
  `ranksep = max(120, maxLabelWidth + 60)` scalar, intending to make the
  midpoint label pills fit by construction. It never shipped and has been
  reverted: the pill is screen-space while the gap is page-space, so no
  gap wins under fit-to-width, and on a real 11-node tree the widening
  cost 72% bbox width (fit 0.58 → 0.34) and made pill crowding worse.
  The composed layout is back on `@workspec/c4-layout`'s pinned 80px
  default. Readability at low zoom is now handled where it is solvable:
  the C4 card collapses to a flat accent bar + title below 0.35 zoom and
  edge labels stop rendering below 0.45, matching the enterprise card
  idiom. Accessible names are unaffected — they come from the a11y
  wrapper, not the card body. Auto-laid node positions shift back
  accordingly; `C4Explorer`, `renderSvg` consumers (c4-studio
  `render`/`c4_render`) and the parity fixtures all pick this up.
- **Pinned node sizes are honoured end-to-end.** A `.layout/` pin carrying
  `width`/`height` now sizes the interactive card AND anchors its edges to
  the real card faces (previously the projection forced every node to the
  default 300×110, so a pinned-size node rendered at pin size in the old
  renderer but its edges — and `renderSvg` — routed against a phantom
  default-size rect, visibly detaching them).
- **`renderSvg` edge colours are literals.** Uncategorized edges resolved to
  the `var(--ink-fade)` token, which no standalone SVG consumer can resolve
  (strokes fell back to `none` — invisible edges in the container dogfood
  SVG). Edge stroke/arrowhead colours now resolve through the theme token
  map at emission, like element fills always did; the emitted document
  contains no `var(` anywhere.
- **`direction` prop** is now advisory (positions stay authoritative; edge
  routes are recomputed live by the router).
- **Double-click** on a node activates once per click pair (the engine
  synthesizes double-click); previously each click activated independently.
- `style/spec-defaults.ts` re-exports the canonical tables from
  `@workspec/canvas-c4` (single source of truth).
