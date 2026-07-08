# @workspec/c4-ui

Host-agnostic React components for interactive WorkSpec C4 diagrams — a standalone library and a
module-federation remote, built on [`@workspec/design`](https://github.com/FieldstateNZ/workspec-design)
tokens over [`@workspec/c4-schema`](../c4-schema) / [`@workspec/c4-model`](../c4-model) /
[`@workspec/c4-layout`](../c4-layout).

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

// The full tree-nav + canvas experience over a whole model:
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

- **`C4Diagram`** — renders one positioned diagram view: elements styled per kind (accent, icon,
  shape), orthogonal category-coloured edges with relationship labels. Interactive: hover tooltip
  (title, kind, description, technology, tags, and a Links section when `elementsByKindAndSlug` is
  supplied), click/Enter drill-down (`onNavigate(slug)` — called with the clicked node's own
  resolved slug; the caller decides whether that slug maps anywhere), wheel/drag pan-zoom, keyboard
  (arrow keys pan, `+`/`-` zoom, `Enter` drills down a focused node). ARIA roles/labels on every
  node and edge.
- **`C4Explorer`** — a left tree nav over every diagram in a `C4Model` plus a `C4Diagram` pane. Owns
  navigation state and calls `@workspec/c4-layout`'s `layoutDiagram` per selection (race-guarded —
  an in-flight layout for an abandoned selection never clobbers the current one). Shows a lens
  toggle (`@workspec/design`'s `LensToggle`) for a `c4-container` diagram's logical/deployment split.
  Implements drill-down by looking up whether the clicked slug names another diagram in the model.
- **`renderSvg(diagram, options?)`** — a standalone, deterministic SVG string: no React runtime, no
  external stylesheet, every colour resolved to a literal theme-token value (or a `spec.yaml`/
  Enterprise-default accent). Built from the SAME geometry/style modules `C4Diagram` uses
  (`src/geometry/node-shape.ts`, `src/geometry/edge-path.ts`, `src/style/spec-defaults.ts`, …), so
  the interactive canvas and the static export can never silently draw a diagram differently — see
  `render-svg.shared-modules.test.ts`.

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

Every colour/spacing/font comes from `@workspec/design` tokens (`var(--*)`). The one documented
exception for colour VALUES is `src/style/spec-defaults.ts`: a byte-for-byte mirror of WorkSpec
Enterprise's `DEFAULT_ELEMENT_STYLES`/`DEFAULT_CONNECTION_STYLES` (which kind/category maps to
which accent hue, shape, and variant) — Enterprise conformance DATA, not a design token, and a
loaded `spec.yaml` can override any of it at runtime. `zero-local-tokens.test.ts` greps every
other source file (TS/TSX/CSS) for raw colour literals: hex, colour functions
(`rgb`/`hsl`/`oklch`/`oklab`/`lab`/`lch`/`color`), and Tailwind arbitrary colour values
(`src/style/color-mix.ts`, the in-code `color-mix` equivalent `renderSvg` needs, is exempt from
the colour-FUNCTION pattern only — it parses colour syntax but must stay hex-free).

Node surfaces/borders/kind-text are not flat tokens: they derive from each node's accent per
Enterprise's `.c4-el` color-mix layer (surface = accent 9% over `--bg-elevated`, border = accent
at 28% alpha, eyebrow = accent 70% into `--ink`; dark mode lifts the accent 22% toward white
first, with 14%/34% surface/border mixes). The percentages live in `src/style/element-tints.ts`,
declared as CSS `color-mix(in oklab, ...)` rules in `src/styles.css` for the canvas and computed
in code by `src/style/color-mix.ts` for `renderSvg` — `element-tints.test.ts` pins the stylesheet
to the constants so the two renderers cannot drift.

## Build

- `pnpm build` — the standalone library (`tsc --emitDeclarationOnly` + `tsup` + a Tailwind CSS
  compile into `dist/styles.css`), mirroring `packages/decision-ui`.
- `pnpm build:mf` — the module-federation remote (`vite.config.mf.ts`), exposing `./C4Diagram` and
  `./C4Explorer` with React as a shared singleton and everything else (the c4-\* siblings,
  `@workspec/design`) bundled in. `apps/mf-host` mounts both for the CI smoke proof.

## Testing

`pnpm test` (Vitest + jsdom + React Testing Library). Component/fixture tests load a hand-authored,
representative `.workspec/` tree through the real `@workspec/c4-model` pipeline
(`createMemorySource` + `loadC4Model`), never a hand-typed lookalike `C4Model` shape — see
`src/test-helpers/synthetic-model.ts`, which also sets up a three-level drill-down chain
(context → container → component) via the slug-matches-a-diagram-slug convention
`C4Explorer.handleNavigate` implements.
