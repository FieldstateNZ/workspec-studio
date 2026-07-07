# @workspec/decision-schema

The Zod **source of truth** for WorkSpec Decision Studio artifacts. One definition yields three
outputs, always in sync:

1. **TypeScript types** (`z.infer`)
2. **runtime validation** (`safeParse`, with YAML line/column error mapping)
3. **JSON Schema** (draft 2020-12) for editor IntelliSense — committed under `json-schema/` at the
   repo root

See [`docs/workspec-decision-schema-v0.1.md`](../../docs/workspec-decision-schema-v0.1.md) for the
full schema spec.

## Artifacts & file naming (normative)

| Artifact | Suffix            | What it holds                                               |
| -------- | ----------------- | ----------------------------------------------------------- |
| Decision | `*.decision.yaml` | Options, criteria, per-env costs, levers, outcome           |
| Catalog  | `*.catalog.yaml`  | Pricing modes, schedules, SKUs (the engine's priced tables) |

Files are discovered purely by these suffixes — no index, no database. The constants
`DECISION_FILE_SUFFIX`, `CATALOG_FILE_SUFFIX`, the globs, and `isDecisionFile()` / `isCatalogFile()`
are exported for the repository layer.

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
2. Open `examples/hosting-platform/hosting-platform.decision.yaml`.
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

| Script                                               | Does                                 |
| ---------------------------------------------------- | ------------------------------------ |
| `pnpm --filter @workspec/decision-schema build`      | tsup → `dist/` (ESM + `.d.ts`)       |
| `pnpm --filter @workspec/decision-schema typecheck`  | `tsc --noEmit`                       |
| `pnpm --filter @workspec/decision-schema test`       | vitest (schema, YAML mapping, drift) |
| `pnpm --filter @workspec/decision-schema gen:schema` | regenerate `json-schema/`            |
