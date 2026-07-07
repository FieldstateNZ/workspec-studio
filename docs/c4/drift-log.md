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
   `.layout/` file *schema*, no engine code).

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
    `.passthrough()` per kind variant — extra keys ride along, and an entry with *two* kind keys
    parses (the resolver picks the first kind present; multi-kind entries are only caught there).
    This package's typed-ref node variants are `.strict()`, so `{component: "x", container: "y"}`
    — or a typed ref with any stray key — is rejected at parse time. Same hardening rationale as
    (a), called out separately because it changes accepted *shapes*, not just unknown-key
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
