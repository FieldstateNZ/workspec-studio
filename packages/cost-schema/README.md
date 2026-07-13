# @workspec/cost-schema

The Zod **source of truth** for WorkSpec Cost Attribution artifacts. One definition yields three
outputs, always in sync:

1. **TypeScript types** (`z.infer`)
2. **runtime validation** (`safeParse`, with YAML line/column error mapping)
3. **JSON Schema** (draft 2020-12) for editor IntelliSense — committed under `json-schema/` at the
   repo root

This package is normative: every other `@workspec/cost-*` package (provider, engine, UI, CLI)
depends on it, directly or transitively — never the reverse.

## Artifacts & file naming (normative)

| Artifact    | Suffix               | What it holds                                                       |
| ----------- | -------------------- | -------------------------------------------------------------------- |
| Inventory   | `*.inventory.yaml`   | A point-in-time stock-take of provider resources                     |
| Spend       | `*.spend.yaml`       | Billed rows for a period, attributed to resources (or left unresolved) |
| Attribution | `*.attribution.yaml` | Dimensions, ordered rules, and pinned overrides                      |
| TagPlan     | `*.tagplan.yaml`     | The tagging actions needed to converge on an attribution result      |

Files are discovered purely by these suffixes — no index, no database. The constants
`INVENTORY_FILE_SUFFIX`/`SPEND_FILE_SUFFIX`/`ATTRIBUTION_FILE_SUFFIX`/`TAGPLAN_FILE_SUFFIX`, the
matching globs, and `isInventoryFile()`/`isSpendFile()`/`isAttributionFile()`/`isTagPlanFile()` are
exported for the repository layer (a later slice).

## The sort-order contract: `git diff` IS the drift report

`Inventory.spec.resources[]`, `Spend.spec.rows[]`, and `TagPlan.spec.entries[]` each have a
**mandatory, schema-enforced sort order**:

- Inventory resources: ascending by `id` (plain JavaScript string comparison — UTF-16 code-unit order; validators and serializers share this comparator).
- Spend rows: ascending by `(resourceId ?? sourceLabel, period, serviceCategory)`.
- TagPlan entries: ascending by `(resourceId, tag)`.

Validation rejects a file whose array isn't already in that order (`superRefine`, exact issue path
at the first out-of-order element). This is deliberate: two stock-takes (or spend pulls, or tag
plans) that differ only in which order resources happened to be discovered must serialize
byte-for-byte identically wherever nothing actually changed, so a plain `git diff` between them
shows **only** meaningful drift — a resource added/removed, an amount that changed, a tag that
needs updating. `src/serialize.ts` produces that canonical order (and canonical key order, and
sorted record/map keys); `src/*.ts` (the Zod schemas) reject anything else. Author tooling is
expected to always go through the serializer rather than hand-rolling YAML.

`Attribution.spec.rules[]` is the one array that is **not** resorted: rule order is match
precedence (see below), so the serializer preserves author order there.

## Attribution: match semantics, effects, and overrides

An `Attribution` artifact declares:

- **`dimensions[]`** — named axes of cost allocation (e.g. `product`, `team`), each with a
  fixed set of declared value ids.
- **`rules[]`** — ORDERED. The order in the file is the match precedence: the attribution engine
  (a later slice) applies the first matching rule, independently **per dimension**. Each rule has:
  - **`match`** — conditions that must ALL hold (logical AND). An empty object `{}` matches every
    resource, so a catch-all rule belongs last. Available fields: `resourceType` (exact),
    `nameGlob`/`resourceGroup` (glob, `*` is the only wildcard), `subscription` (exact),
    `tagEquals` (`{ name, value }`, exact), `tagExists` (tag name only).
  - One or more **effects** (at least one is required): `assign` (literal per-dimension value),
    `split` (per-dimension ratio map, ≥2 entries summing to 1 within `1e-6`), `fromTag` (read the
    resource's own tag value at run time — dynamic, so it isn't checked against declared values).
    A given dimension id may appear in at most one effect field per rule.
- **`overrides[]`** — pinned per-resource assignments that beat all rules (engine precedence; the
  attribution engine, C2, documents first-match-wins-per-dimension and override-beats-rules in
  full).

## TagPlan: action consistency

Each `TagPlan.spec.entries[]` row is one resource × tag, with `current`/`desired` values (or
`null`) and an `action`. The schema enforces: `add` ⇒ current null, desired set; `remove` ⇒ current
set, desired null; `change` ⇒ both set and different; `noop` ⇒ equal. `current`/`desired` are plain
strings with **no character restriction** — the engine may pre-serialize a split assignment into a
tag value like `workspec:60|atrium:40`, and this schema must not (and does not) forbid `:` or `|`.

## Usage

```ts
import { parseInventoryYaml, InventoryArtifact, type Inventory } from '@workspec/cost-schema';

const res = parseInventoryYaml(fileText);
if (res.ok) {
  const inventory: Inventory = res.data;
} else {
  for (const e of res.errors) {
    console.error(`${e.path}: ${e.message} (line ${e.line}:${e.col})`);
  }
}

// Or validate an already-parsed object directly:
const parsed = InventoryArtifact.safeParse(obj);
```

Exports: the Zod schemas (`InventoryArtifact`, `SpendArtifact`, `AttributionArtifact`,
`TagPlanArtifact`, and their nested pieces), the inferred types (`Inventory`, `Spend`,
`Attribution`, `TagPlan`, …), the YAML load helpers (`parseInventoryYaml`, `parseSpendYaml`,
`parseAttributionYaml`, `parseTagPlanYaml`, `ParseResult`, `ParseIssue`), the byte-stable
serializers (`serializeInventoryYaml`, `serializeSpendYaml`, `serializeAttributionYaml`,
`serializeTagPlanYaml`), the JSON Schema builders (`buildInventoryJsonSchema`, …), and the version /
URL / naming constants.

## The `$schema` directive & editor IntelliSense

Every artifact should start with a `yaml-language-server` directive binding it to the published
JSON Schema, e.g.:

```yaml
# yaml-language-server: $schema=https://schema.workspec.io/v1alpha1/inventory.schema.json
```

Because every field carries a Zod `.describe(...)`, those descriptions surface as **hover docs**
on each key in editors with the YAML extension (`redhat.vscode-yaml`), and completion is offered
for property names and enum values. Until the public URL is live, point the extension at the
committed schema files instead — add to `.vscode/settings.json`:

```jsonc
{
  "yaml.schemas": {
    "./json-schema/inventory.schema.json": "*.inventory.yaml",
    "./json-schema/spend.schema.json": "*.spend.yaml",
    "./json-schema/attribution.schema.json": "*.attribution.yaml",
    "./json-schema/tagplan.schema.json": "*.tagplan.yaml",
  },
}
```

## Regenerating the JSON Schema

The JSON Schema is generated from Zod and committed. Regenerate after any schema change:

```bash
pnpm --filter @workspec/cost-schema gen:schema
```

A vitest **drift test** regenerates all four schemas in-memory and asserts byte-equality with the
committed `json-schema/*.schema.json`, so CI fails if the committed files are stale.

## Scripts

| Script                                              | Does                                          |
| ---------------------------------------------------- | ---------------------------------------------- |
| `pnpm --filter @workspec/cost-schema build`         | tsup → `dist/` (ESM + `.d.ts`)                |
| `pnpm --filter @workspec/cost-schema typecheck`     | `tsc --noEmit`                                |
| `pnpm --filter @workspec/cost-schema test`          | vitest (schema, YAML mapping, round-trip, drift) |
| `pnpm --filter @workspec/cost-schema gen:schema`    | regenerate `json-schema/`                     |

## Dependency direction

`cost-schema` has zero `@workspec` dependencies. Every other `@workspec/cost-*` package depends on
it, directly or transitively — never the reverse.
