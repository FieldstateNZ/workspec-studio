# @workspec/decision-schema

The Zod **source of truth** for WorkSpec Decision Studio artifacts. One definition yields three
outputs, always in sync:

1. **TypeScript types** (`z.infer`)
2. **runtime validation** (`safeParse`, with YAML line/column error mapping)
3. **JSON Schema** (draft 2020-12) for editor IntelliSense — committed under `json-schema/` at the
   repo root

See [`docs/workspec-decision-schema-v0.1.md`](../../docs/decisions/workspec-decision-schema-v0.1.md) for the
full schema spec.

Built on `@workspec/schema-core`'s K8s-style artifact envelope (`defineArtifact`): every kind is
`{apiVersion, kind, metadata: {slug?}, spec}`. Identity is the artifact's filename slug, derived by
the loader (`slugFromPath`, in `@workspec/schema-core`) — `metadata.slug` is optional and only
needed when an author wants it visible without opening a directory listing. There is no
`metadata.id` — the artifact carries no id of its own.

## Artifacts & type directories (normative)

| Artifact | Kind       | Type directory (under `.workspec/`) | What it holds                                               |
| -------- | ---------- | ----------------------------------- | ----------------------------------------------------------- |
| Decision | `Decision` | `decisions`                         | Options, criteria, per-env costs, levers, outcome           |
| Catalog  | `Catalog`  | `catalogs`                          | Pricing modes, schedules, SKUs (the engine's priced tables) |

`TYPE_DIRECTORIES`/`typeDirectoryFor(kind)` give the `.workspec/<dir>` path for each kind (e.g.
`typeDirectoryFor('Decision')` → `.workspec/decisions`). Discovery is a directory walk keyed off
these — the repository layer (`@workspec/decision-studio`'s `FsRepository`) owns it; this package
no longer ships filename-suffix/glob discovery helpers.

Each kind's former `metadata` fields now live on `spec`: Decision's `title`/`status`/`created`/
`deciders`/`supersedes`, Catalog's `name`/`currency`/`asOf`. Two of those are cross-artifact refs,
now bare slugs instead of an id or a relative path:

- `spec.supersedes` (Decision, optional) — the **slug** of the decision this one supersedes
  (`decisions/<slug>.yaml`). Used to be the superseded decision's old `metadata.id`.
- `spec.catalog` (Decision, required) — the **slug** of the catalog this decision prices against
  (`catalogs/<slug>.yaml`), resolved by the loader to `.workspec/catalogs/<slug>.yaml`. Used to be a
  relative file path, e.g. `"./platform.catalog.yaml"`.

Both are schema-shape-only: a dangling ref (no such decision/catalog slug) is a `verify`-time
concern for the host, not a schema validation error. An artifact's own internal ids (criterion ids,
option ids, `outcome.decidedBy`, catalog SKU/mode/schedule ids, etc.) are unaffected — those are
ordinary `spec` fields, not artifact identity.

## Usage

```ts
import { parseDecisionYaml, DecisionArtifact, type Decision } from '@workspec/decision-schema';

const res = parseDecisionYaml(fileText);
if (res.ok) {
  const decision: Decision = res.data;
} else {
  for (const e of res.errors) {
    console.error(`${e.path}: ${e.message} (line ${e.line}:${e.col})`);
  }
}

// Or validate an already-parsed object directly:
const parsed = DecisionArtifact.safeParse(obj);
```

Exports: the Zod schemas (`DecisionArtifact`, `CatalogArtifact`, `Option`, `Line`, `Lever`, …), the
inferred types (`Decision`, `Catalog`, `Option`/`OptionType`, …), the YAML load helpers
(`parseDecisionYaml`, `parseCatalogYaml`, `ParseResult`, `ParseIssue`), the JSON Schema builders
(`buildDecisionJsonSchema`, `buildCatalogJsonSchema`), and the version / URL / naming constants.

## The `$schema` directive & editor IntelliSense

Every artifact should start with a `yaml-language-server` directive binding it to the published
JSON Schema:

```yaml
# yaml-language-server: $schema=https://schema.workspec.io/v1alpha1/decision.schema.json
```

### Verifying completion + hover docs in VS Code (manual)

The acceptance criterion "opening a fixture gives completion and hover docs" is verified like so:

1. Install the **YAML** extension (`redhat.vscode-yaml`).
2. Open `packages/decision-schema/test/fixtures/valid/hosting-platform.decision.yaml`.
3. Because every field carries a Zod `.describe(...)`, those descriptions surface as **hover
   docs** on each key, and Ctrl/⌘-Space offers **completion** for property names and enum values
   (e.g. `status:` suggests `exploring` / `decided` / `superseded`).
4. Introduce an error (e.g. change `status:` to `pending`) and the editor red-squiggles it.

Until the public URL is live, point the extension at the committed schema files instead — add to
`.vscode/settings.json`:

```jsonc
{
  "yaml.schemas": {
    "./json-schema/decision.schema.json": "*.decision.yaml",
    "./json-schema/catalog.schema.json": "*.catalog.yaml",
  },
}
```

## Regenerating the JSON Schema

The JSON Schema is generated from Zod and committed. Regenerate after any schema change:

```bash
pnpm gen:schema          # from the repo root
```

A vitest **drift test** regenerates the schema in-memory and asserts byte-equality with the
committed `json-schema/*.schema.json`, so CI fails if the committed files are stale.

## Scripts

| Script                                               | Does                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------- |
| `pnpm --filter @workspec/decision-schema build`      | tsup → `dist/` (ESM + `.d.ts`)                                |
| `pnpm --filter @workspec/decision-schema typecheck`  | `tsc -b` (project references against `@workspec/schema-core`) |
| `pnpm --filter @workspec/decision-schema test`       | vitest (schema, YAML mapping, drift)                          |
| `pnpm --filter @workspec/decision-schema gen:schema` | regenerate `json-schema/`                                     |

## Dependency direction

`decision-schema` depends on `@workspec/schema-core` (the shared K8s-style envelope, path/slug
helpers, and JSON Schema generation) and nothing else in the `@workspec` scope. Every other
`@workspec/decision-*` package depends on `decision-schema`, directly or transitively — never the
reverse.
