# @workspec/c4-ui changelog

## 0.1.0-alpha.6 (S4 #120 + S5 #121 — the canvas recomposition; staged, publishes on the next tag)

S5 additions: the pre-S4 SVG renderer's dead `.c4-node*`/`.c4-canvas` chrome rules were pruned
from `styles.css` (anything still selecting against them — CSS overrides, automation — must
target the canvas-c4 `.c4-el` card chrome instead; the `.c4-node` tint-derivation block itself
remains as the pinned encoding `element-tints.test.ts` verifies against `renderSvg`). READMEs
now document the recomposition contracts. Everything below landed in S4:

`C4Diagram` and `C4Explorer` are now facades over the shared canvas engine
(`@workspec/canvas` + `@workspec/canvas-c4`) — the enterprise C4 look on the
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
- **Label-aware layer spacing.** The composed elk layout now widens the gap
  between node layers to fit the widest edge-label pill (the enterprise
  `ranksep = max(120, maxLabelWidth + 60)` formula, computed by
  `@workspec/canvas-c4`'s `labelAwareLayerSpacing` and passed through
  `@workspec/c4-layout`'s new additive `layerSpacing` option — that
  package's own default stays the fixed 80px, and existing `.layout/` pins
  are untouched). Previously a long label on a short edge clipped under the
  neighbouring cards. Auto-laid node positions shift accordingly;
  `C4Explorer`, `renderSvg` consumers (c4-studio `render`/`c4_render`) and
  the parity fixtures all pick this up.
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
