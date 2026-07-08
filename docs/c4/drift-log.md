# C4 schema drift log

Recorded during the S2 conformance pass on `@workspec/c4-schema` (`packages/c4-schema`), updated
after the S2 adversarial review. Two kinds of entry live here:

- **Issue-vs-code drift** — places the public GitHub issue text disagreed with what WorkSpec
  Enterprise's own code (`lib/yaml-schemas`, `artifacts/api-server`,
  `artifacts/workspec/src/canvas/c4`, `lib/db/src/schema/diagram-layouts.ts`) actually does. The
  code won, and the disagreement is logged rather than papered over.
- **Deliberate studio-vs-Enterprise divergence** — places `@workspec/c4-schema` knowingly does
  something different from Enterprise. Each one is a reviewable decision, not an accident.

## Issue text vs Enterprise code

1. **File extension.** The issue text shows elements like `components/diagram-editor.yml`. The
   real Enterprise convention is `.yaml`, never `.yml`. `@workspec/c4-schema`'s `FILE_EXTENSION`
   constant is `.yaml`; nothing in this package ever produces or accepts `.yml`.

2. **No `slug:` field.** The issue text implies `slug:` might be an in-file field. In reality, slug
   identity is the file path: the slug is the filename minus `.yaml`, and no element schema in
   this package has a `slug` property. `slugFromPath` / `artifactPathFor` encode this directly.

3. **No `external: boolean`.** A widely-referenced "c4-core skill" DSL has an `external: bool`
   field on elements. Enterprise has no such field anywhere in `lib/yaml-schemas` — externality is
   expressed entirely by the `external-system` kind (plus the `variant: external` style entry in
   `spec.yaml`). Note the honest asymmetry in how the two implementations treat such a field:
   Enterprise's element schemas are plain `z.object(...)`, so an `external: true` key would be
   silently **stripped** on parse; this package's element schemas are `.strict()`, so the same key
   is **rejected** with an error (see `test/fixtures/invalid/element-external-boolean.yaml`). Both
   agree the field does not exist; they differ on strip-vs-reject — see divergence (a) below.

4. **`class`/`interface`/`function` and deployment-level elements have no schemas.** These three
   kinds appear in `C4_REF_KINDS` (valid diagram node ref kinds) but have no type directory and no
   backing element schema today — deployment topology is a separate subsystem in Enterprise, out
   of scope for the C4 element family. `@workspec/c4-schema` deliberately does not invent schemas
   for these three kinds; `ARTIFACT_KINDS` (the kinds with directories) is a strict subset of
   `C4_REF_KINDS` (the kinds valid as diagram node ref targets).

5. **The public workspec repo's own `.workspec/` tree is nearly empty.** At survey time,
   `FieldstateNZ/workspec`'s own tree had one system file, a `spec.yaml`, and two diagram files
   with empty `nodes`/`edges` arrays. Those four files are vendored verbatim as this package's
   `test/fixtures/enterprise-subset/` (byte-identical to the source repo — verified with `diff`)
   and pass validation with zero errors, but on their own that's weak evidence of full conformance
   (there simply isn't much in that tree to exercise). The stronger conformance evidence is (i)
   `test/fixtures/representative/` — a constructed tree exercising every supported kind, both thin
   node shapes, the `__system__` alias, edge label/category/lens, and a `.layout/` file — and (ii)
   the S2 review's field-by-field verification of every schema against
   `lib/yaml-schemas/src/*.ts` in the Enterprise repo.

6. **Kind-list inconsistencies inside Enterprise itself.** `feature` is in `C4_REF_KINDS` but is
   absent from Enterprise's `VALID_DIAGRAM_NODE_TYPES`; `queue` is missing from the
   `create_diagram` MCP tool's prose description. These are pre-existing inconsistencies in
   Enterprise, noted for visibility rather than "fixed" — silently reconciling them here would
   just be a different, unreviewed decision about which list is authoritative.

7. **Layout persists a viewport and no sizes; the issue text asks for "coordinates/sizes."**
   Enterprise's `diagram_layouts` table persists `nodePositions` (coordinates only) and `viewport`
   (camera state) — no per-node size and no per-edge routing. `@workspec/c4-schema`'s `.layout/`
   format graduates exactly what Enterprise persists (`nodes: {x,y}`, `viewport`), plus optional
   `width`/`height` per node and optional `edges` routing hints as new surface the standalone
   file-based format needs but the DB-backed Enterprise implementation doesn't. Flagged as a
   design decision for Brett to confirm, not asserted as settled.

8. **Dagre vs ELK.** Enterprise's auto-layout uses dagre; the S4 brief for the standalone layout
   engine mandates ELK. Deliberate, already-agreed choice — not drift — recorded here because it
   looks like an inconsistency on a shallow read. Out of scope for S2 (this package holds the
   `.layout/` file _schema_, no engine code).

9. **No `apiVersion`/`kind` envelope.** Unlike the decision/catalog artifact family
   (`@workspec/decision-schema`), Enterprise's existing C4 element YAML has no envelope — files
   are the bare element shape directly at the document root. This package validates the bare shape
   as-is. Whether the C4 family should adopt the envelope for consistency with the decision family
   is a Brett call, per the survey.

10. **The survey itself had errors** (corrected in the S2 adversarial-review round against the
    real source): it said feature `description` was optional (Enterprise `feature.ts` has it
    **required**, plain `z.string()`); it omitted the optional `cardinality` key on links entries
    (`common.ts` `linkEntrySchema`); it omitted the diagram-level `source` field (both
    `ThinDiagramYamlSchema` and `FatDiagramYamlSchema` carry it); it understated how lenient the
    style spec is (`StyleSpecYamlSchema` is optional-everything, free strings, passthrough, with a
    `surfaces` block); and its "title (req)" phrasing led to over-tightened `.min(1)` constraints
    on fields Enterprise types as plain `z.string()` (title, tags entries, technology, edge
    from/to/label/category, node slugs/ids). All are now conformant in this package: `.min(1)`
    survives only where Enterprise has it (element `description` fields).

## Deliberate divergences remaining in @workspec/c4-schema

(a) **`.strict()` where Enterprise strips.** Every element schema, both diagram schemas (and
their fat nodes/edges/tag styles), and the layout schema in this package are `.strict()`: an
unknown key is a validation **error**. The corresponding Enterprise schemas are plain
`z.object(...)`: unknown keys are silently **stripped** on parse. This is deliberate
authoring-contract hardening — a typo'd field name in a studio-authored file fails loudly
instead of being dropped on the floor. Consequence to keep in view: if a future Enterprise
version adds a field to one of these shapes, files carrying it will **fail studio validation**
until this package ships the matching schema update. The style spec is the exception: it is
passthrough end-to-end, faithfully matching Enterprise's lenient `StyleSpecYamlSchema`.

(b) **Typed-ref diagram nodes: strict vs passthrough.** Enterprise's `typedRefNodeSchema` is
`.passthrough()` per kind variant — extra keys ride along, and an entry with _two_ kind keys
parses (the resolver picks the first kind present; multi-kind entries are only caught there).
This package's typed-ref node variants are `.strict()`, so `{component: "x", container: "y"}`
— or a typed ref with any stray key — is rejected at parse time. Same hardening rationale as
(a), called out separately because it changes accepted _shapes_, not just unknown-key
tolerance.

(c) **The links entry rule is runtime-only.** The "exactly one `{linkType: pathRef}` pair, plus
optional `cardinality`" rule is a Zod `superRefine` — JSON Schema cannot express it, so the
generated `*.schema.json` types a links entry as an open object. Editors (VS Code YAML) will
NOT red-squiggle a malformed links entry; runtime Zod validation (`parse*Yaml` / `safeParse`)
will catch it. The same applies to the pathRef `~/`/`@workspace/` prefix rule and the
cardinality enum, which live inside the superRefine. Noted in the package README's
IntelliSense section.

(d) **`slugify` skips Enterprise's unicode-escape preprocessing.** Enterprise's `slugify` first
runs `decodeUnicodeEscapes` (turning literal `\uXXXX` sequences into characters) — an MCP
tool-input normalisation concern, not slug semantics. This package's `slugify` is otherwise
operation-for-operation identical (lowercase → collapse non-alphanumerics → trim hyphens →
`slice(0, 64)` with **no** second trim, so a slug whose 64-char cut lands on a hyphen keeps
it). For inputs containing no literal `\u` escape sequences the two functions are
byte-identical.

(e) **`LinkCardinality` is `.strict()`.** Enterprise's `linkCardinalitySchema` is a plain
`z.object` (an unknown key inside `cardinality` would be stripped); this package rejects it.
Same hardening family as (a).

(f) **Layout `viewport.zoom` must be strictly positive.** The `.layout/` format is new surface
(no Enterprise file format to conform to), but for the record: Enterprise's `diagram_layouts`
DB column has no zoom constraint. This package rejects `zoom <= 0` because a non-positive
zoom has no renderable meaning.

## S5 — `@workspec/c4-ui` (issue #6): drift and new conventions

11. **Drill-down has no backing field anywhere in the model — the issue text's "clicking an
    element whose slug matches another diagram's scope" doesn't correspond to any real
    `@workspec/c4-model`/`@workspec/c4-schema` field.** No `Diagram`/`ResolvedDiagram` carries a
    "scope" or "parent element" concept; diagram slugs are just filenames, independent of any
    element slug. `@workspec/c4-ui` establishes its OWN convention, layered entirely at the UI
    level: `C4Diagram` proposes a drill via `onNavigate(clickedNode.slug)` unconditionally for any
    node with a resolved slug (it has no model access to know whether a match exists);
    `C4Explorer.handleNavigate` is what actually decides, switching diagrams only when the clicked
    slug equals another diagram's own slug (a no-op otherwise). This is new studio-authoring
    guidance for content authors, not an Enterprise-conformance fact: to get automatic drill-down,
    name a system's container-level diagram after the system's own slug, and a domain's
    component-level diagram after the domain's own slug (exactly what
    `src/test-helpers/synthetic-model.ts`'s fixture does: `system/ledger.yaml` +
    `diagrams/ledger.yaml`, `domains/billing.yaml` + `diagrams/billing.yaml`). Flagged for Brett —
    an explicit `scope:`/`parent:` field on the diagram schema would be a cleaner long-term
    answer, but that's a `@workspec/c4-schema` change, out of this slice's boundary.

12. **Node surface/border/eyebrow ADOPT Enterprise's accent derivation (the `.c4-el` color-mix
    layer), replicated over @workspec/design tokens.** Enterprise's style-spec governing rule
    ("users author identity; the renderer owns legibility — derived from the accent on a neutral,
    theme-aware surface") is implemented in `artifacts/workspec/src/index.css`'s "C4 style-spec v2
    token layer" as `color-mix(in oklab, ...)` over its theme tokens — which is achievable
    grep-clean here, so this package matches it rather than flattening to neutral surfaces (an
    earlier revision of this entry wrongly claimed zero-local-tokens forced the flattening).
    `src/styles.css`'s `.c4-node` layer replicates the derivation verbatim against
    `@workspec/design` tokens: surface = accent 9% over `--bg-elevated` (14% dark), border =
    accent 28% over transparent (34% dark), eyebrow/kind text = accent 70% into `--ink` (the
    lifted accent itself in dark), dimmed secondary text = ink at 60% (62% dark), and dark mode
    first lifts the accent 22% toward white — the renderer sets `--c4-el-accent-raw` inline per
    node exactly as Enterprise's `C4NodeComponent` sets `--el-accent-raw`. The same percentages
    live in `src/style/element-tints.ts` (pinned to the stylesheet by `element-tints.test.ts`) so
    `renderSvg` computes identical values in code. The `external` variant dashes the 4px accent
    identity stripe (Enterprise's dashed `borderLeft`), and hover draws Enterprise's 2px dashed
    accent outline (`C4NodeComponent`'s active-not-selected treatment). Remaining micro-deltas,
    listed honestly: (i) connection accents are NOT lifted 22% toward white in dark
    (Enterprise's `.c4-conn` layer does this for edge strokes; here edges/arrowheads use the raw
    category accent in both themes); (ii) no corner watermark icon (Enterprise draws the kind
    icon huge and faint — `--el-watermark`, accent 14%/18% over transparent — bleeding off the
    card; here the icon is small, top-left, accent-coloured); (iii) no `data-scope="focus"`
    deepened tint (Enterprise's in-scope subject node — no counterpart concept in this package's
    props); (iv) hover here does not scale the node 1.03 or add the soft halo box-shadow (an SVG
    transform scale would visibly detach the node from its routed edge anchors mid-hover).

13. **No frosted-glass type-label pill below the box.** The fieldstate-c4-core skill's rendering
    doctrine (behavioural reference only, not binding visual spec) puts the kind label in a
    floating pill below each node. This package renders the kind as small inline text inside the
    node's own footprint instead — a "keep it basic" simplification within the brief's declared
    freedom, consistent with the fixed `C4_NODE_WIDTH`/`HEIGHT` (300×110) `@workspec/c4-layout`
    already commits to (no room budgeted below the box for a floating pill).

14. **`renderSvg` vs canvas: colours match by construction; the icon glyph and exotic authored
    accents are the remaining gaps.** Both renderers share node shape geometry, edge
    routing/paths, and accent/style resolution (`render-svg.shared-modules.test.ts`), and both
    apply the SAME accent derivation from entry 12: the canvas via `src/styles.css`'s CSS
    `color-mix(in oklab, ...)` rules, `renderSvg` via an in-code oklab implementation
    (`src/style/color-mix.ts`, Ottosson reference math — the same space CSS uses) over the same
    `src/style/element-tints.ts` percentages, so the static export's node surfaces/borders/
    eyebrows agree with the canvas within colour-space rounding rather than falling back to flat
    theme surfaces. Two honest gaps remain: (i) the canvas draws a `lucide-react` kind icon
    (`style/icons.tsx`) the SVG string does not reproduce (embedding per-icon path data was
    judged out of scope; closing it means threading the icon path data, not the components, into
    `render-svg.ts`'s templates); (ii) `color-mix.ts` parses only the accent forms that actually
    occur in this package's inputs — hex, `hsl()` (the Enterprise-defaults form), and
    `var(--token)` — so an exotic authored `spec.yaml` accent (`rgb()`, a named colour, `oklch()`)
    renders flat theme surfaces in the static export while the browser canvas still derives it
    via native CSS `color-mix`.

15. **Element `links` reach the tooltip through a new prop, `elementsByKindAndSlug`, not through
    `resolved`/`diagram` alone.** `@workspec/c4-model`'s `ResolvedDiagramNode` carries
    title/description/technology/tags but not `links` (that field lives on the underlying
    `LoadedElement`, looked up by kind+slug — see `element-key.ts`). `C4Diagram`'s two required
    props (`diagram`, `resolved`) cannot reach it, so `C4Explorer` builds a
    `ReadonlyMap<string, LoadedElement>` from the whole `C4Model` once and threads it down as a
    third, optional prop. This is an addition beyond the brief's literal "props = positioned
    diagram + resolved diagram + optional host" line for `C4Diagram`, made to satisfy the
    "links rendering per LinkResolver host contract" requirement — noted here as the concrete
    resolution of what would otherwise read as an API gap between the brief and
    `@workspec/c4-model`'s actual exported shape.

16. **Build tooling: `vitest`/`typescript` pinned to the c4-\* siblings' versions, not
    `decision-ui`'s.** The brief asks to mirror `decision-ui`'s vitest/TS setup; in practice,
    `vitest@^3.2.4` (decision-ui's pin) failed `toMatchSnapshot()` in this environment with
    `SnapshotClient.setup()` errors — the golden-snapshot test `render-svg.test.ts` requires — and
    a plain `expect.extend()` custom matcher confirmed vitest 3.2.7 itself was the variable, not
    this package's code. `packages/c4-model`/`c4-layout` already use `vitest@^4.1.10` successfully
    (including their own `toMatchSnapshot` golden-layout tests), so `@workspec/c4-ui` matches THAT
    pin instead, plus `typescript@^6.0.3` (vitest 4's `@vitest/expect` types didn't check cleanly
    against `typescript@^5.7.2`). A related pnpm phantom-dependency hazard is documented inline in
    `src/testing.d.ts`/`src/vitest.setup.ts`: `@testing-library/jest-dom` declares neither
    `vitest` nor `@vitest/expect` as a real dependency, so — with sibling packages pinning
    different vitest majors — its own `/vitest` entry point and a naive type augmentation both
    resolve through pnpm's shared hoisted slot rather than this package's own `vitest`; fixed by
    adding `@vitest/expect` as an explicit devDependency (forcing a correctly-versioned local
    resolution) and calling `expect.extend()` directly in `vitest.setup.ts` instead of importing
    jest-dom's own vitest integration module.

## S6 — `@workspec/c4-studio` (issue #7): the ship slice

17. **`apps/site`'s `/c4` demo depends on the four c4 packages (plus `@workspec/design` via
    `c4-ui`) as workspace `devDependencies`, not registry pins — a deliberate, temporary
    exception to the site's own registry-pins-only rule.** Every other `@workspec/*` dependency
    the site takes (`decision-schema`, `decision-engine`, `decision-ui`) is a real published
    version from npm, on principle: "if the site builds, the packages work for outside
    consumers" (see `apps/site/package.json`'s own description). The c4 packages are **not yet
    published** (npm trusted-publisher registration for this repo is still pending — the same
    gate blocking `packages/decision-*`'s releases, see the root README), so pinning a registry
    version for them is impossible today. Rather than leave `/c4` a static stub forever, the
    demo takes the four `@workspec/c4-*` packages plus `@workspec/design` as `workspace:*`
    **devDependencies** (never `dependencies` — they still resolve to workspace source at build
    time, exactly like every other in-repo consumer, not a hand-rolled path alias), with a loud
    comment at the top of `apps/site/package.json`'s devDependencies block and a note in this
    file. **The decisions demo's registry pins are untouched** — this exception is scoped
    exclusively to the c4 packages. One-line change at first publish: flip each `workspace:*`
    entry to the published semver range and move it from `devDependencies` to `dependencies`,
    the same shape `decision-*` already has.

18. **The `render` CLI command has no `--lens` flag.** `@workspec/c4-model` resolves a
    `c4-container` diagram to `lensViews.{logical,deployment}`, never a single `view` — see
    entry 11 above and `preferred-type.ts`. `packages/c4-studio/src/render-diagram.ts` always
    renders the **logical** lens for such a diagram (`diagram.view ?? diagram.lensViews?.logical
?? emptyView`), matching `C4Explorer`'s own default lens. A tree whose container diagram has
    no `domain`-kind elements sharing a slug with a `container`-kind element (this repo's own
    dogfood tree included — see `.workspec/diagrams/container.yaml`, every node a typed ref)
    resolves identically under both lenses regardless, so the single-shot CLI not exposing the
    choice costs nothing there; a tree that DOES lens-disambiguate reaches the deployment lens
    through the interactive `serve` explorer's lens toggle instead. Noted as a deliberate scope
    boundary, not an oversight — the brief's literal flag set for `render` is `--dir`/`--out`/
    `--theme` only.

19. **`workspec-c4 serve`'s API is a generic four-method `C4FileSource` proxy plus one
    convenience endpoint, not a per-artifact-kind API like `@workspec/decision-studio`'s
    server.** Decision Studio's host has one route pair per artifact kind (`GET`/`PUT
/api/decision`, `GET`/`PUT /api/catalog`) because `DecisionRepositoryPort` is a six-method,
    kind-aware port. `@workspec/c4-model`'s repository port (`C4FileSource`) is already generic
    (`listFiles`/`readFile`/`writeFile`/`exists`, kind-agnostic) — proxying THAT port directly
    over HTTP (`GET /api/files`, `GET /api/file`, `PUT /api/file`, `GET /api/file-exists`) is the
    natural equivalent, not an invented one. `GET /api/model` is the one addition beyond the
    literal port: it runs `loadC4Model` server-side and returns the whole resolved model as JSON
    (`Map`s converted to plain objects, since JSON has no `Map`), so the browser client gets one
    round trip for its initial load instead of reconstructing the tree itself over the generic
    proxy. The proxy is deliberately least-privilege in BOTH directions. Reads (`GET
/api/files`/`/api/file`/`/api/file-exists`) are confined to `.workspec/**` at the shared
    parameter gate — the explorer client only ever requests `.workspec/` paths, so serving
    anything else in the served root (`.git/`, `.env`, source files) would be needless surface;
    such paths are 400'd, never read. Writes are narrower still: since the only write path any
    `@workspec/c4-ui` component ever exercises is the drag-to-pin `.layout/` write
    (`C4Diagram`'s `writeLayout`), `PUT /api/file` additionally refuses every path that isn't a
    `.layout/` file (`isLayoutFile`), and Zod-validates the body against `Layout`
    (`parseLayoutYaml`) before it reaches the working tree — the same "validate before write,
    never trust the client" principle `decision-studio`'s `PUT /api/decision`/`PUT /api/catalog`
    already established.
