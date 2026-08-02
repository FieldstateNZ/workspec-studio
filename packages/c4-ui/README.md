# @workspec/c4-ui

Host-agnostic React components for interactive WorkSpec C4 diagrams — a standalone library and a
module-federation remote, built on [`@workspec/design`](https://github.com/FieldstateNZ/workspec-design)
tokens over [`@workspec/c4-schema`](../c4-schema) / [`@workspec/c4-model`](../c4-model) /
[`@workspec/c4-layout`](../c4-layout).

Since the S4 canvas recomposition (#120), `C4Diagram` and `C4Explorer` are **facades over the
shared canvas engine**: [`@workspec/canvas`](../canvas) supplies the per-instance store, camera,
pointer pipeline and orthogonal edge router; the in-package **C4 layer** (`src/c4/` — folded in
from the retired, never-published `@workspec/canvas-c4` package, ADR
[i](../../docs/canvas/decisions/i-fold-canvas-c4-into-c4-ui.md)) supplies the
`ResolvedDiagram` → shape projection, the enterprise C4 card chrome and the canonical
spec-defaults style tables (this package's `style/spec-defaults.ts` is a re-export). The C4
layer's API — `buildC4Shapes`, `projectC4Diagram`, `elkC4Layout`, `labelAwareLayerSpacing`,
`registerC4`, `buildCanvasSpec`, the `C4CanvasHost` bridge contract (+ `C4NodeMeta` and the
shape types), the `c4node`/`c4boundary` modules and `C4NodeStatusSlot` — is exported from this
package's index, so enterprise hosts consume the whole C4 surface from `@workspec/c4-ui` alone.
The public props, interaction contract and a11y surface of both components are unchanged —
consumers of the pre-S4 SVG renderer need no code changes; see `CHANGELOG.md` for the
behavioural notes (camera replaces the stretch model, enterprise card/edge chrome, label-aware
layer spacing).

Components receive already-loaded data as props — there is no repository fetch, no global, no
ambient theme. Load a model with `@workspec/c4-model`, lay it out with `@workspec/c4-layout`, and
hand the results to `C4Diagram`/`C4Explorer`.

## Usage

```tsx
import { createFsSource, loadC4Model } from '@workspec/c4-model/fs';
import { layoutDiagram } from '@workspec/c4-layout';
import { C4Diagram, C4Explorer } from '@workspec/c4-ui';
import '@workspec/c4-ui/styles.css';

const model = await loadC4Model(createFsSource('/path/to/repo'));

// The full workbench (level tabs + canvas + detail rail) over a whole model:
<C4Explorer model={model} theme="dark" />;

// Or drive a single diagram view directly:
const diagram = model.diagrams.find((d) => d.slug === 'system-context')!;
const positioned = await layoutDiagram({
  nodes: diagram.view!.nodes,
  edges: diagram.view!.edges,
  layout: diagram.layout?.data ?? null,
});
<C4Diagram diagram={positioned} resolved={diagram} spec={model.spec.data} theme="dark" />;
```

## Components

- **`C4Diagram`** — renders one positioned diagram view: the enterprise card chrome per kind
  (accent left bar, watermark icon, eyebrow/title/description, cylinder/pill silhouettes),
  orthogonal category-coloured edges (rounded elbows, face-aligned arrowheads, lane fan-out,
  obstacle detours, midpoint label chips). Interactive: hover tooltip
  (title, kind, description, technology, tags, and a Links section when `elementsByKindAndSlug` is
  supplied), click/Enter drill-down (`onNavigate(slug)` — called with the clicked node's own
  resolved slug; the caller decides whether that slug maps anywhere), click/Enter-to-select
  (`onSelect(node | null)` — called with the activated node, or with `null` on a plain background
  click/Escape; renders a persistent accent ring via `selectedNodeId`), wheel-zoom about the
  cursor + background-drag pan, keyboard (arrow keys pan, `+`/`-` zoom, `Enter` drills down AND
  selects a focused node, `Escape` clears the selection). `onNavigate` and `onSelect` are
  independent — a host can wire one, the other, or both from the same click; `C4Explorer` (below)
  wires only `onSelect`, so its clicks never drill down on their own. ARIA roles/labels on every
  node and edge.

  **Camera model (S4):** the diagram fills its host-sized container through the enterprise
  camera — no distortion (the old `preserveAspectRatio='none'` stretch is gone), zoom clamped
  0.1–4, content auto-fitted (capped at 1×) on load and on every diagram/lens switch. **Size the
  mounting element** — the old intrinsic aspect-ratio height no longer exists; unsized hosts fall
  back to a 320px minimum.

- **`C4Explorer`** — a workbench over every diagram in a `C4Model`: a header row of segmented C4-level
  tabs (`role="group"` + `aria-pressed`, a toggle button group, not an ARIA tablist) — one numbered
  tab per canonical level (`1 · Context` / `2 · Container` / `3 · Component`) when the model has
  exactly one diagram of that type, falling back to the diagram's own title (appended after the
  numbered tabs) for an off-scheme diagram type or a second diagram sharing an already-claimed
  level — plus a mono `diagrams ▸ <slug>` crumb, over a canvas pane and a detail rail (an `aside`
  labelled "Element details"). Owns navigation state (which diagram, which lens for a
  `c4-container` diagram, which element is selected) and calls `@workspec/c4-layout`'s
  `layoutDiagram` per selection (race-guarded — an in-flight layout for an abandoned selection never
  clobbers the current one). Shows a lens toggle (`@workspec/design`'s `LensToggle`) for a
  `c4-container` diagram's logical/deployment split.

  Clicking an element populates the rail (kind, name, description, a `Tech` row when the element
  carries a technology, its links via the SAME `LinksBlock`/`LinkResolver` the hover tooltip uses)
  instead of navigating; clicking the canvas background, switching diagrams, or pressing `Escape`
  clears it. Drill-down is a deliberate second step: when the selected element's own slug names
  another diagram in the model (the model's only drill-down signal — there is no separate "parent
  diagram"/"scope" field in `@workspec/c4-model` to consult), the rail shows an explicit
  "Open container/component view →" button; clicking it switches diagrams. An element with no such
  match shows no drill button.

  > **Breaking DOM change (workbench layout):** the left tree-nav sidebar was replaced by the
  > segmented level tabs — the `.c4-explorer-tree`/`.c4-tree-item*` classes and the
  > diagram-title-named nav buttons no longer exist. Anything selecting against that markup
  > (tests, CSS overrides, automation) must target the level-tab buttons and the detail rail
  > instead. `C4Explorer`'s props are unchanged.

- **`renderSvg(diagram, options?)`** — a standalone, deterministic SVG string: no React runtime, no
  external stylesheet, every colour resolved to a literal theme-token value (or a `spec.yaml`/
  Enterprise-default accent) — the emitted document contains no `var(` anywhere. Built on the
  SAME shared modules `C4Diagram` uses: `@workspec/canvas`'s orthogonal router
  (`resolveConnectorGeometry` + `roundedConnectorPath`) and the C4 layer's projection +
  canonical spec-defaults (`src/c4/`'s `buildC4Shapes`, `style/spec-defaults.ts`), so the interactive canvas
  and the static export can never silently draw a diagram differently — enforced by
  `render-svg.shared-modules.test.ts`, which verifies both files actually CALL the shared
  modules. Every interpolated string is escaped (CodeQL `js/html-constructed-from-input`
  hardening, including hostile `spec.yaml` accents).

## Host contract

```ts
interface C4StudioHost {
  source?: C4FileSource; // only needed for the drag-to-pin write-back path
  linkResolver?: LinkResolver; // resolves an element's `links` entries; omit for every link to render inert
  capabilities: { editLayout: boolean };
}
```

`host` is a direct prop on `C4Diagram`/`C4Explorer` (not a context provider — unlike
`@workspec/decision-ui`, these components take already-loaded data as props, so there's no
repository-scoped cache to own). Omit `host` entirely for a fully read-only, link-inert render.

**Drag-to-pin**: gated on `host.capabilities.editLayout && host.source`. Dragging a node updates its
position locally (and recomputes the routes of edges touching it, so they stay attached — no
relayout pass) and, on release, writes the diagram's `.layout/` file back through
`host.source.writeFile(layoutPathFor(diagram.slug), ...)`, built via `@workspec/c4-layout`'s
`serialize()` merged with the diagram's existing `.layout/` data (a `c4-container` diagram's two
lenses share one file — see `src/drag/serialize-for-write.ts`).

## Zero local design tokens

Every colour/spacing/font comes from `@workspec/design` tokens (`var(--*)`). The documented
exceptions for colour VALUES are the C4 layer's three conformance-data files —
`src/c4/style/spec-defaults.ts` (the canonical table mirroring WorkSpec Enterprise's
`DEFAULT_ELEMENT_STYLES`/`DEFAULT_CONNECTION_STYLES`: which kind/category maps to which accent
hue, shape, and variant — Enterprise conformance DATA, not a design token, and a loaded
`spec.yaml` can override any of it at runtime; `src/style/spec-defaults.ts` is a grep-clean
re-export of it), `src/c4/style/status-colors.ts`, and `src/c4/style/local-tokens.css`.
`token-audit.test.ts` (the fold-reconciled union of this package's zero-local-tokens grep and
the canvas-c4 token audit) additionally verifies every `var(--*)` read resolves from
`@workspec/design`, the package's own CSS, or the runtime-set accents, and greps every
non-exempt source file (TS/TSX/CSS) for raw colour literals: hex, colour functions
(`rgb`/`hsl`/`oklch`/`oklab`/`lab`/`lch`/`color`), Tailwind arbitrary colour values, and
named-colour keywords (`src/style/color-mix.ts`, the in-code `color-mix` equivalent `renderSvg`
needs, is exempt from the colour-FUNCTION pattern only — it parses colour syntax but must stay
hex-free).

Node surfaces/borders/kind-text are not flat tokens: they derive from each node's accent per
Enterprise's `.c4-el` color-mix layer (surface = accent 9% over `--bg-elevated`, border = accent
at 28% alpha, eyebrow = accent 70% into `--ink`; dark mode lifts the accent 22% toward white
first, with 14%/34% surface/border mixes), staged through `@workspec/design`'s shared
`--el-tint-*` tokens. The LIVE card chrome ships in the C4 layer's `.c4-el` stylesheet
layer (`src/c4/index.css`, composed into this package's stylesheet — see Build below); `renderSvg` computes the
identical numbers in code via `src/style/element-tints.ts` + `src/style/color-mix.ts`, and
`element-tints.test.ts` pins `src/styles.css`'s retained `.c4-node` derivation block to those
constants so the encodings cannot drift.

## Build

- `pnpm build` — the standalone library (`tsc --emitDeclarationOnly` + `tsup` + a Tailwind CSS
  compile into `dist/styles.css`), mirroring `packages/decision-ui`. The compiled stylesheet is
  still the ONE file consumers load: `src/index.css` composes `@workspec/canvas/styles.css` (the
  scoped `.wsc-root` engine layer) and the C4 layer's `src/c4/index.css` (the `.c4-el` card
  derivation) into `@workspec/c4-ui/styles.css`, so existing consumers keep their single import.
- `pnpm build:mf` — the module-federation remote (`vite.config.mf.ts`), exposing `./C4Diagram` and
  `./C4Explorer` with React as a shared singleton (peer range `^18.3.0 || ^19.0.0`) and everything
  else (the c4-\* siblings, `@workspec/canvas`, `@workspec/design`) bundled
  in. `apps/mf-host` mounts both for the CI smoke proof.

## Testing

`pnpm test` (Vitest + jsdom + React Testing Library). Component/fixture tests load a hand-authored,
representative `.workspec/` tree through the real `@workspec/c4-model` pipeline
(`createMemorySource` + `loadC4Model`), never a hand-typed lookalike `C4Model` shape — see
`src/test-helpers/synthetic-model.ts`'s `loadSyntheticModel`, which also sets up a three-level
drill-down chain (context → container → component) via the slug-matches-a-diagram-slug convention
`C4Explorer`'s detail rail implements its "Open container/component view" button with, and
`loadAmbiguousLevelModel`, which covers the level-tab derivation's fallback branch (two diagrams
sharing one canonical C4 type, so neither can be numbered unambiguously).
