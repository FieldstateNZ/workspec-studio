# @workspec/c4-schema

The Zod **source of truth** for WorkSpec C4 diagram artifacts. One definition yields three
outputs, always in sync:

1. **TypeScript types** (`z.infer`)
2. **runtime validation** (`safeParse`, with YAML line/column error mapping)
3. **JSON Schema** (draft 2020-12) for editor IntelliSense — committed under `json-schema/c4/` in
   this package

Schemas match the shapes used by WorkSpec Enterprise's `lib/yaml-schemas` — see
[`docs/c4/drift-log.md`](../../docs/c4/drift-log.md) at the repo root for the handful of places
the public issue text and the real Enterprise code disagree.

## Artifacts & directories (normative)

| Kind                   | Directory                     | Schema URL                                                           |
| ---------------------- | ----------------------------- | -------------------------------------------------------------------- |
| Actor                  | `.workspec/actors/`           | `https://schema.workspec.io/v1alpha1/c4/actor.schema.json`           |
| System (singleton)     | `.workspec/system/`           | `https://schema.workspec.io/v1alpha1/c4/system.schema.json`          |
| External system        | `.workspec/external-systems/` | `https://schema.workspec.io/v1alpha1/c4/external-system.schema.json` |
| Container              | `.workspec/containers/`       | `https://schema.workspec.io/v1alpha1/c4/container.schema.json`       |
| Component              | `.workspec/components/`       | `https://schema.workspec.io/v1alpha1/c4/component.schema.json`       |
| Database               | `.workspec/databases/`        | `https://schema.workspec.io/v1alpha1/c4/database.schema.json`        |
| Queue                  | `.workspec/queues/`           | `https://schema.workspec.io/v1alpha1/c4/queue.schema.json`           |
| Domain                 | `.workspec/domains/`          | `https://schema.workspec.io/v1alpha1/c4/domain.schema.json`          |
| Feature                | `.workspec/features/`         | `https://schema.workspec.io/v1alpha1/c4/feature.schema.json`         |
| Diagram                | `.workspec/diagrams/`         | `https://schema.workspec.io/v1alpha1/c4/diagram.schema.json`         |
| Layout                 | `.workspec/diagrams/.layout/` | `https://schema.workspec.io/v1alpha1/c4/layout.schema.json`          |
| Style spec (singleton) | `.workspec/spec.yaml`         | `https://schema.workspec.io/v1alpha1/c4/spec.schema.json`            |

`class`, `interface`, and `function` are valid diagram node ref kinds (`C4_REF_KINDS`) but have no
backing element schema or directory — Enterprise conformance note, not an oversight (see the drift
log).

## Slug conventions (normative)

- **Identity is the path, not a field.** A file's slug is its filename minus `.yaml` — there is no
  `slug:` key inside the element YAML itself.
- File extension is **always `.yaml`**, never `.yml`.
- `slugify(input)`: lowercase, every run of non-alphanumeric characters collapsed to one `-`,
  leading/trailing hyphens trimmed, then capped at 64 characters (Enterprise-identical operation
  order: the cap comes after the trim with no re-trim, so a cut landing on a `-` keeps it).
- `artifactPathFor(kind, slug)` builds `.workspec/<type-dir>/<slug>.yaml`.
- `layoutPathFor(diagramSlug)` builds `.workspec/diagrams/.layout/<diagramSlug>.yaml` — layout
  files are nested under a `.layout/` directory sibling to diagram artifacts, not mixed in with
  them, so a listing of `diagrams/` never needs to filter layout files out by convention alone.

## The `.layout/` format

`.workspec/diagrams/.layout/<diagram-slug>.yaml`, one optional file per diagram, graduating
Enterprise's `diagram_layouts` DB table (`nodePositions`, `viewport`) into a plain committable
file:

```yaml
version: 1
nodes:
  architect: { x: 80, y: 200, width: 240, height: 120 }
  __system__: { x: 400, y: 200 }
edges:
  'architect->__system__':
    waypoints:
      - { x: 200, y: 220 }
      - { x: 300, y: 220 }
viewport: { x: 0, y: 0, zoom: 1 }
```

**Optionality is the contract:**

- No `.layout/` file for a diagram → the diagram is fully auto-laid-out.
- A node present in `nodes` → that element's position is pinned; everything else still
  auto-layouts around it.
- `edges` is optional routing hints, keyed `"<from>-><to>"`. Enterprise persists **no** per-edge
  routing today (geometry is fully re-derived each render) — this is new surface for the
  standalone format. **v1 note:** parallel edges between the same pair of nodes share the one
  routing hint; there is no per-parallel-edge disambiguation yet.
- `viewport` is optional persisted camera state (`x`, `y`, `zoom`), graduating Enterprise's
  persisted viewport. `zoom` must be strictly positive.
- `width`/`height` on a node are optional. Enterprise has no per-node size persistence (every C4
  node is a fixed 300×110) — these exist here because a standalone layout format shouldn't
  hard-code node dimensions the way an embedded canvas implementation can, but they're not
  required: omit them to use the renderer's default sizing.

Loading/resolving a diagram against its layout file (or auto-laying it out when absent) is out of
scope for this package — see the S3 (loader/resolution) and S4 (layout engine) slices.

## Usage

```ts
import {
  parseActorYaml,
  parseDiagramYaml,
  parseLayoutYaml,
  ActorElement,
} from '@workspec/c4-schema';

const res = parseActorYaml(fileText);
if (res.ok) {
  const actor: ActorElement = res.data;
} else {
  for (const e of res.errors) {
    console.error(`${e.path || '<root>'}: ${e.message} (line ${e.line}:${e.col})`);
  }
}

// Or validate an already-parsed object directly:
const parsed = ActorElement.safeParse(obj);
```

Every element/diagram/spec/layout schema is exported (`ActorElement`, `SystemElement`,
`ExternalSystemElement`, `DomainElement`, `FeatureElement`, `C4Element` for
container/component/database/queue, `Diagram` / `ThinDiagram` / `FatDiagram`, `Spec`, `Layout`),
alongside the shared field schemas (`linksField`, `LinkCardinality`, `sourceField`,
`StyleSurfaceSet`), a `parse*Yaml` wrapper for each artifact, the naming/path helpers
(`artifactPathFor`, `slugFromPath`, `slugify`, `layoutPathFor`, `isLayoutFile`,
`TYPE_DIRECTORIES`, `WORKSPEC_DIR`, `FILE_EXTENSION`), the JSON Schema builders
(`buildJsonSchema`, `buildAllJsonSchemas`, `serializeJsonSchema`), and the URL/directive
constants (`schemaUrlFor`, `schemaDirective`, `*_SCHEMA_URL`, `*_SCHEMA_DIRECTIVE`).

## The `$schema` directive & editor IntelliSense

Every artifact should start with a `yaml-language-server` directive binding it to the published
JSON Schema:

```yaml
# yaml-language-server: $schema=https://schema.workspec.io/v1alpha1/c4/actor.schema.json
```

### Verifying completion + hover docs in VS Code (manual)

The acceptance criterion "opening a fixture gives completion and hover docs" is verified like so:

1. Install the **YAML** extension (`redhat.vscode-yaml`).
2. Open `test/fixtures/representative/.workspec/actors/architect.yaml`.
3. Because every field carries a Zod `.describe(...)`, those descriptions surface as **hover
   docs** on each key, and Ctrl/⌘-Space offers **completion** for property names and enum values
   (e.g. `lens:` on a diagram edge suggests `logical` / `deployment` / `both`; `phase:` on the
   system element suggests `discovery` / `delivery` / `archived`).
4. Introduce an error (e.g. add `external: true` to an element file) and the editor red-squiggles
   it as an unrecognized property.

Note: the links-entry rule ("exactly one `{<linkType>: <pathRef>}` pair, plus optional
`cardinality`", with the `~/` / `@workspace/` prefix requirement) is a Zod `superRefine` that JSON
Schema cannot express — the editor will not flag a malformed links entry; runtime validation
(`parse*Yaml` / `safeParse`) will.

Until the public URL is live, point the extension at the committed schema files instead — add to
`.vscode/settings.json`:

```jsonc
{
  "yaml.schemas": {
    "./packages/c4-schema/json-schema/c4/actor.schema.json": ".workspec/actors/*.yaml",
    "./packages/c4-schema/json-schema/c4/system.schema.json": ".workspec/system/*.yaml",
    "./packages/c4-schema/json-schema/c4/external-system.schema.json": ".workspec/external-systems/*.yaml",
    "./packages/c4-schema/json-schema/c4/container.schema.json": ".workspec/containers/*.yaml",
    "./packages/c4-schema/json-schema/c4/component.schema.json": ".workspec/components/*.yaml",
    "./packages/c4-schema/json-schema/c4/database.schema.json": ".workspec/databases/*.yaml",
    "./packages/c4-schema/json-schema/c4/queue.schema.json": ".workspec/queues/*.yaml",
    "./packages/c4-schema/json-schema/c4/domain.schema.json": ".workspec/domains/*.yaml",
    "./packages/c4-schema/json-schema/c4/feature.schema.json": ".workspec/features/*.yaml",
    "./packages/c4-schema/json-schema/c4/diagram.schema.json": ".workspec/diagrams/*.yaml",
    "./packages/c4-schema/json-schema/c4/layout.schema.json": ".workspec/diagrams/.layout/*.yaml",
    "./packages/c4-schema/json-schema/c4/spec.schema.json": ".workspec/spec.yaml",
  },
}
```

## Regenerating the JSON Schema

The JSON Schema is generated from Zod and committed. Regenerate after any schema change:

```bash
pnpm --filter @workspec/c4-schema run gen:schema
```

A Vitest **drift test** (`test/conformance/drift.test.ts`) regenerates every schema in-memory and
asserts byte-equality with the committed `json-schema/c4/*.schema.json`, so CI fails if the
committed files fall out of sync.

## Scripts

| Script                                             | Does                                           |
| -------------------------------------------------- | ---------------------------------------------- |
| `pnpm --filter @workspec/c4-schema run build`      | `tsc --emitDeclarationOnly` + tsup → `dist/`   |
| `pnpm --filter @workspec/c4-schema run typecheck`  | `tsc --noEmit`                                 |
| `pnpm --filter @workspec/c4-schema run test`       | vitest (schema, YAML mapping, drift, fixtures) |
| `pnpm --filter @workspec/c4-schema run gen:schema` | regenerate `json-schema/c4/`                   |

## Out of scope (see other slices)

- Loading/resolving thin diagram refs into rendered nodes, the `__system__` alias, and
  `PREFERRED_TYPE_BY_DIAGRAM` disambiguation — **S3**.
- The auto-layout engine that fills in unpinned `.layout/` node positions — **S4**.
- React canvas components — **S5**.
