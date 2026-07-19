# @workspec/req-schema

The Zod **source of truth** for WorkSpec Traceability Workbench requirement artifacts. One Zod
definition per kind yields TypeScript types (`z.infer`), runtime validation (`safeParse`), and
generated JSON Schema. Builds on [`@workspec/schema-core`](../schema-core) — it reuses that
package's envelope builder (`defineArtifact`), path/slug helpers, `Slug`/`linksField` primitives,
and the shared `Actor` kind rather than re-defining them.

Freezes the artifact model in [`docs/traceability/spec.md`](../../docs/traceability/spec.md) §4.

## The five kinds

| Kind                | Directory                        | Purpose                                                         |
| ------------------- | -------------------------------- | --------------------------------------------------------------- |
| `Actor`             | `.workspec/actors/`              | Re-exported from `@workspec/schema-core` (owned there).         |
| `Feature`           | `.workspec/features/`            | Thin grouping container requirements attach to.                 |
| `UserRequirement`   | `.workspec/requirements/user/`   | The user-story promise the RTM traces.                          |
| `SystemRequirement` | `.workspec/requirements/system/` | **A Gherkin Rule** — groups scenarios, has no steps of its own. |
| `Scenario`          | `.workspec/scenarios/`           | **The executed unit** — ONE Gherkin scenario per file.          |

Each is a K8s-style envelope (`apiVersion`/`kind`/`metadata`/`spec`) validating a
`.workspec/<dir>/<slug>.yaml` file. The slug is the filename stem (`slugFromPath`) — for a
`Scenario` the slug is the scenario name is the identity.

## A system-requirement is a Gherkin Rule

A `SystemRequirement` groups the scenarios that prove it and verifies one or more user-requirements
— but carries no `given`/`when`/`then` steps of its own. Those live on `Scenario` (its own, fifth,
file-native kind), which references its parent Rule via `systemRequirement`.

```yaml
# yaml-language-server: $schema=https://schema.workspec.io/v1alpha1/system-requirement.schema.json
apiVersion: workspec.io/v1alpha1
kind: SystemRequirement
metadata:
  slug: inline-create # a Rule — groups scenarios, has no steps of its own
spec:
  title: Inline element creation
  feature: element-authoring # intra-tree ref → features/*
  userReqs: [authoring-flow] # intra-tree refs → requirements/user/* (the "verifies" edge)
```

```yaml
# yaml-language-server: $schema=https://schema.workspec.io/v1alpha1/scenario.schema.json
apiVersion: workspec.io/v1alpha1
kind: Scenario
metadata:
  slug: inline-create-persists # scenario name = slug = identity
spec:
  title: Creating an element inline saves it immediately
  systemRequirement: inline-create # intra-tree ref → requirements/system/* (its parent Rule)
  given:
    - a canvas with no selected element
  when:
    - the dev lead double-clicks empty canvas
  then:
    - the element is persisted # required, non-empty
```

An optional `examples` table on a `Scenario` turns it into a Scenario Outline; `given`/`when`/`then`
may then reference `<placeholder>` tokens. T1 does not cross-validate placeholders against the
table. A Rule with no scenarios is an "empty rule" (spec §4.7) — a requirement with no proof at
all — a finding derived at the model layer, not a schema error.

## Refs and links

- **Bare-slug intra-tree refs** (`actor`, `feature`, `features[]`, `userReqs[]`,
  `systemRequirement`) — the field implies the kind. The schema enforces slug _shape_ only; a
  dangling ref is a `verify`-time failure, not a schema error.
- **`links`** — the shared `@workspec/schema-core` `linksField`: `{<linkType>: <pathRef>}` entries
  where the pathRef starts with `~/` or `@workspace/`. The spec §4.8 `<kind>:<slug>` kind-qualified
  cross-layer shorthand is **not** frozen in T1 (deferred pending Enterprise parent-chain
  confirmation — spec §9.2); cross-layer refs ride the pathRef `linksField` for now.

## Evidence: `TestRun`

`TestRun` (spec §4.6) is a flat, machine-ingested JSON shape (not a `defineArtifact` envelope),
produced by `workspec-trace ingest`, never authored. `results` keys on the **scenario** slug alone
(the scenario is the executed unit and its own kind, so there is no composite
`<sysreq>/<scenario>` key); `pass`/`fail`/`skip`/_absence_ are distinct (absence = unproven, derived
at the model layer). The on-disk home (`.runs/`) is deferred to the ingest CLI (T4).

## JSON Schema generation

The full-envelope JSON Schema for each of the four owned kinds is generated from Zod (via
`z.toJSONSchema`) and committed under `json-schema/`, with a flat `$id`
(`https://schema.workspec.io/v1alpha1/{feature,user-requirement,system-requirement,scenario}.schema.json`).
`Actor`'s schema is owned and published by `@workspec/schema-core`.

```bash
pnpm --filter @workspec/req-schema run gen:schema
```

A Vitest **drift test** (`test/conformance/drift.test.ts`) regenerates the four schemas in-memory
and asserts byte-equality with the committed files; `test/conformance/req-fixtures.test.ts`
validates the §4 example artifacts and a set of invalid fixtures (one distinct failure per kind).

## Scripts

| Script                                          | Does                                         |
| ----------------------------------------------- | -------------------------------------------- |
| `pnpm --filter @workspec/req-schema build`      | `tsc --emitDeclarationOnly` + tsup → `dist/` |
| `pnpm --filter @workspec/req-schema typecheck`  | `tsc --noEmit`                               |
| `pnpm --filter @workspec/req-schema test`       | vitest (schemas, paths, drift, fixtures)     |
| `pnpm --filter @workspec/req-schema gen:schema` | regenerate `json-schema/`                    |

## Dependency direction

`req-schema` depends only on `@workspec/schema-core` (and `zod`). Every other `@workspec/trace-*`
package depends on this one, directly or transitively — never the reverse.
