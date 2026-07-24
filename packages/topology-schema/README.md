# @workspec/topology-schema

The Zod **source of truth** for WorkSpec Topology Studio artifacts. One definition yields three
outputs, always in sync:

1. **TypeScript types** (`z.infer`)
2. **runtime validation** (`safeParse`, with YAML line/column error mapping)
3. **JSON Schema** (draft 2020-12) for editor IntelliSense — committed under `json-schema/` at the
   repo root

Built on `@workspec/schema-core`'s K8s-style artifact envelope (`defineArtifact`): every kind is
`{apiVersion, kind, metadata: {slug?}, spec}`. Identity is the artifact's filename slug, derived by
the loader (`slugFromPath`, in `@workspec/schema-core`) — `metadata.slug` is optional and only
needed when an author wants it visible without opening a directory listing.

## Artifacts & type directories (normative)

| Artifact    | Kind          | Type directory (under `.workspec/`) | What it holds                                     |
| ----------- | ------------- | ------------------------------------ | -------------------------------------------------- |
| Topology    | `Topology`    | `topologies`                         | Declared connection graph over resources/envs      |
| Resource    | `Resource`    | `resources`                          | A single infrastructure node (or grouping node)    |
| Environment | `Environment` | `environments`                       | Naming conventions + per-resource override patches |

`TYPE_DIRECTORIES`/`typeDirectoryFor(kind)` give the `.workspec/<dir>` path for each kind.

### Layout: a special file, not a fourth kind

A topology's `.layout/` file (`.workspec/topologies/.layout/<topology-slug>.yaml`) is **not** a
registered artifact kind — it mirrors `@workspec/c4-schema`'s treatment of diagram layouts exactly:
a bare schema (no `apiVersion`/`kind`/`metadata` envelope), its own path helpers (`layoutPathFor`,
`isLayoutFile`), and its own JSON Schema (`topology-layout.schema.json`, not folded into
`ARTIFACT_KINDS`/`TYPE_DIRECTORIES`).

The one topology-specific extension over c4's layout shape: because a topology renders through two
lenses (network, resource-group), a pinned node carries a position **per lens** —
`positions: { network?: {x,y,width,height}, rg?: {x,y,width,height} }` — instead of c4's single
`{x,y,width,height}`.

## Resource kinds (closed enum)

`client`, `compute`, `function`, `database`, `cache`, `endpoint`, `monitor`, `vnet`, `subnet`,
`resource-group`, `edge`, `gateway`, `identity`, `search`, `storage`, `vault`.

`vnet`/`subnet`/`resource-group` are **ordinary resources** of these kinds — there is no separate
"is this a container" flag. Whether a kind behaves as a grouping/container node or a leaf node is a
presentation-layer decision made from `kind` alone, downstream of this schema.

## Usage

```ts
import { parseTopologyYaml, TopologyArtifact, type Topology } from '@workspec/topology-schema';

const res = parseTopologyYaml(fileText);
if (res.ok) {
  const topology: Topology = res.data;
} else {
  for (const e of res.errors) {
    console.error(`${e.path}: ${e.message} (line ${e.line}:${e.col})`);
  }
}

// Or validate an already-parsed object directly:
const parsed = TopologyArtifact.safeParse(obj);
```

Exports: the Zod schemas (`TopologyArtifact`, `ResourceArtifact`, `EnvironmentArtifact`, `Layout`,
`Connection`, …), the inferred types (`Topology`, `Resource`, `Environment`, `Layout`, …), the YAML
load helpers (`parseTopologyYaml`, `parseResourceYaml`, `parseEnvironmentYaml`, `parseLayoutYaml`),
the repository port + in-memory test double (`createMemoryRepository`), the JSON Schema builders,
and the version / URL / naming constants.

## The `$schema` directive & editor IntelliSense

Every artifact should start with a `yaml-language-server` directive binding it to the published
JSON Schema, e.g.:

```yaml
# yaml-language-server: $schema=https://schema.workspec.io/v1alpha1/topology.schema.json
```

## Regenerating the JSON Schema

The JSON Schema is generated from Zod and committed. Regenerate after any schema change:

```bash
pnpm gen:schema          # from the repo root, or:
pnpm --filter @workspec/topology-schema gen:schema
```

A vitest **drift test** regenerates the schema in-memory and asserts byte-equality with the
committed `json-schema/*.schema.json`, so CI fails if the committed files are stale.

## Scripts

| Script                                                | Does                                                          |
| ------------------------------------------------------ | -------------------------------------------------------------- |
| `pnpm --filter @workspec/topology-schema build`      | tsup → `dist/` (ESM + `.d.ts`)                                 |
| `pnpm --filter @workspec/topology-schema typecheck`  | `tsc -b` (project references against `@workspec/schema-core`) |
| `pnpm --filter @workspec/topology-schema test`       | vitest (schema, YAML mapping, repository, drift)               |
| `pnpm --filter @workspec/topology-schema gen:schema` | regenerate `json-schema/`                                      |

## Dependency direction

`topology-schema` depends on `@workspec/schema-core` (the shared K8s-style envelope, path/slug
helpers, and JSON Schema generation) and nothing else in the `@workspec` scope. Every other
`@workspec/topology-*` package depends on `topology-schema`, directly or transitively — never the
reverse.
