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
| Resource    | `Resource`    | `resources`                          | A single infrastructure node (or grouping node), plus its own per-environment override patches |
| Environment | `Environment` | `environments`                       | Naming conventions for one deployment environment  |

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

## Per-environment resource overrides (S1)

A `Resource` may carry `spec.overrides`, keyed by environment id, patching that resource's own
`config`/`cost`/`resourceGroup`/`network` for one environment — e.g. a cheaper SKU/tier in `dev`,
a pricier one in `prod`. Identity fields (`name`/`kind`/`type`/`provider`) and the presence list
(`environments`) can never be overridden; `realizes`/`links`/`source` aren't deployment-shaping,
so they have no override counterpart either.

```yaml
spec:
  config:
    tier: P1v3
  cost: { sku: p1v3, mode: payg, schedule: always, qty: 1 }
  overrides:
    prod:
      # `tier` REPLACES the base value; `zoneRedundant` is new — it isn't on
      # the base `config` at all. dev/test name no override here, so they
      # stay at the base `config` (`{ tier: P1v3 }`, no `zoneRedundant` key).
      config: { tier: P2v3, zoneRedundant: true }
      # `sku`/`qty` change; `mode`/`schedule` are inherited from the base
      # `cost` binding unchanged — this is a per-FIELD merge, not a replace.
      cost: { sku: p2v3, qty: 3 }
```

Merge semantics (applied by `@workspec/topology-model`'s `resolve()`, never by this package):
`config` is a **shallow, top-level** replace (a named key wins wholesale, even if both sides are
objects — this is NOT a deep merge, and a `null` override value SETS the key to `null` rather than
removing it — there is no way to make a key "disappear" from the merged result); `cost` merges
field-by-field (`sku`/`mode`/`schedule`/`qty`/`attribution`); `resourceGroup`/`network` fully
replace the base ref when present (both are `Slug`-typed, never nullable, so an override can only
swap one placement for another — never clear a resource OUT of its resourceGroup/network for one
environment while the base resource has one).

Two integrity rules apply to every override key, BOTH enforced by `@workspec/topology-model`'s
`checkOverrideEnvironmentRefs` at verify-time — schema validation here only checks field SHAPE, not
whether a key makes sense:

- The key must name one of the owning Topology's declared `spec.environments` — necessarily
  verify-time, since a standalone Resource file has no visibility into which environments exist.
- This resource must actually be PRESENT in that environment, per its own (explicit)
  `spec.environments`. This one COULD be a schema-level check (it only needs this one file), but
  isn't: a schema failure invalidates the whole artifact, which cascades into unrelated spurious
  diagnostics everywhere else the resource is referenced — S1 shipped it as a `superRefine` and
  moved it here after adversarial review found exactly that.

This mechanism lived on `Environment.spec.overrides[resourceSlug]` in v0; S1 moved it onto the
Resource so a resource's whole cross-env story lives in one file (see `resource.ts`'s
`ResourceOverride` doc comment for the full rationale).

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
