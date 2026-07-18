# @workspec/schema-core

The shared base every `@workspec/*-schema` package builds on. Where `@workspec/cost-schema` and
`@workspec/decision-schema` each hand-roll their own K8s-style envelope per artifact kind, and
`@workspec/c4-schema` defines its own `WORKSPEC_DIR`/`TYPE_DIRECTORIES`/`slugify`/`linksField`
primitives, this package factors the common pieces out into one place:

1. **The envelope builder** (`defineArtifact`) — one function that produces the
   `{ apiVersion, kind, metadata, spec }` wrapper every artifact kind shares.
2. **Path and slug helpers** (`WORKSPEC_DIR`, `TYPE_DIRECTORIES`, `typeDirectoryFor`, `slugify`,
   `slugFromPath`) — the `.workspec/<kind-dir>/<slug>.yaml` convention.
3. **Shared primitives** (`linksField`, `LinkCardinality`, `Slug`) used by every kind's spec.
4. **The canonical `Actor` kind** — the one kind genuinely shared across families today.

**Non-breaking bootstrap:** nothing in this repo consumes this package yet. `c4-schema` and other
existing families keep their own copies of these shapes for now; they adopt `@workspec/schema-core`
in a later slice instead of being migrated as part of this one.

## The envelope: `defineArtifact`

```ts
import { z } from 'zod';
import { defineArtifact } from '@workspec/schema-core';

const WidgetSpec = z.object({ label: z.string().min(1) }).describe('A widget.');
const WidgetArtifact = defineArtifact('Widget', WidgetSpec);
```

`defineArtifact(kind, specSchema)` returns a Zod object:

```ts
z.object({
  apiVersion: z.literal('workspec.io/v1alpha1'),
  kind: z.literal(kind),
  metadata: MetadataSchema,
  spec: specSchema,
});
```

`MetadataSchema` carries an optional `slug`: per the `.workspec/<kind-dir>/<slug>.yaml`
convention, a loader derives an artifact's slug from its filename (`slugFromPath`) — there's no
requirement to also write it inside the file. When an author does write `metadata.slug`, it must
already be a valid slug (`Slug`) so it can't silently drift from the filename. `MetadataSchema` and
the envelope itself are deliberately left non-`.strict()` (unknown keys are stripped, not
rejected) — same as every existing K8s-envelope artifact in this repo (`cost-schema`,
`decision-schema`); only `c4-schema`'s flat, non-enveloped element schemas reject unknown keys.

## The shared `Actor` kind

```yaml
# yaml-language-server: $schema=https://schema.workspec.io/v1alpha1/actor.schema.json
apiVersion: workspec.io/v1alpha1
kind: Actor
metadata:
  slug: dev-lead
spec:
  name: Dev lead
  description: Runs a build, delegates slices, owns signoff.
  tags: [human]
  links:
    - adr: ~/docs/decisions/staffing.md
```

Lives at `.workspec/actors/<slug>.yaml`. This reconciles two existing shapes:

- `@workspec/c4-schema`'s `ActorElement` calls the name field `title`.
- `docs/traceability/spec.md` §4.1's Actor calls it `name`.

`name` wins — this is the canonical Actor both `c4-schema` and the Traceability Workbench consume
going forward (in a later slice; see the bootstrap note above). Unlike `ActorElement`, `description`
is optional here: c4-schema's "empty title allowed, but description required" split was an
Enterprise-parity quirk specific to that package, not a rule worth carrying into the shared kind.

## Path and slug helpers

| Export                   | Does                                                                  |
| ------------------------ | --------------------------------------------------------------------- |
| `WORKSPEC_DIR`           | `.workspec` — root of a WorkSpec working tree                         |
| `FILE_EXTENSION`         | `.yaml` — the one file extension WorkSpec artifacts use               |
| `ARTIFACT_KINDS`         | The shared kinds this package owns a type directory for (`['Actor']`) |
| `TYPE_DIRECTORIES`       | `Record<ArtifactKind, string>`, e.g. `{ Actor: 'actors' }`            |
| `typeDirectoryFor(kind)` | `.workspec/<type-dir>` for a shared kind, e.g. `.workspec/actors`     |
| `slugify(input)`         | Lowercase, collapse non-alphanumeric runs to `-`, trim, cap at 64     |
| `slugFromPath(path)`     | Recovers the slug from an artifact path (filename minus `.yaml`)      |

These are copies of `@workspec/c4-schema`'s own path helpers (same shapes, same behavior) — not
imports, so this package has zero `@workspec` dependencies. A later slice is expected to have
`c4-schema` (and others) depend on `@workspec/schema-core` for these instead of keeping its own
copy.

## Shared primitives

- **`linksField`** — an optional array of `{<linkType>: <pathRef>}` entries, each path ref rooted
  at `~/` (WorkSpec tree) or `@workspace/` (a published package), with an optional `cardinality`
  key for relationship-style links. Same shape as `c4-schema`'s `linksField`.
- **`LinkCardinality`** / **`CARDINALITY_VALUES`** — the `{from, to, label?}` shape a links entry's
  optional `cardinality` key carries.
- **`Slug`** — the Zod primitive validating the shape `slugify()` produces: lowercase alphanumeric
  segments separated by single hyphens, at most 64 characters. Used by `MetadataSchema.slug`.

## JSON Schema generation

The JSON Schema for every shared kind (`Actor` today) is generated from Zod (via `z.toJSONSchema`,
same approach as `c4-schema`) and committed under `json-schema/`:

```bash
pnpm --filter @workspec/schema-core run gen:schema
```

A Vitest **drift test** (`test/conformance/drift.test.ts`) regenerates every schema in-memory and
asserts byte-equality with the committed `json-schema/*.schema.json`, so CI fails if the committed
files fall out of sync. `test/conformance/actor-fixtures.test.ts` validates a representative valid
Actor fixture and rejects two invalid ones (wrong `kind`, missing `spec.name`) under
`test/fixtures/`.

The `$id`/`$schema` URL is flat — `https://schema.workspec.io/v1alpha1/actor.schema.json`, no
per-family path segment — because shared kinds live outside any one family's namespace, unlike
e.g. `c4-schema`'s family-scoped `.../v1alpha1/c4/actor.schema.json`.

## Scripts

| Script                                               | Does                                                |
| ---------------------------------------------------- | --------------------------------------------------- |
| `pnpm --filter @workspec/schema-core run build`      | `tsc --emitDeclarationOnly` + tsup → `dist/`        |
| `pnpm --filter @workspec/schema-core run typecheck`  | `tsc --noEmit`                                      |
| `pnpm --filter @workspec/schema-core run test`       | vitest (schema, path/slug helpers, drift, fixtures) |
| `pnpm --filter @workspec/schema-core run gen:schema` | regenerate `json-schema/`                           |

## Dependency direction

`schema-core` has zero `@workspec` dependencies. It is a _base_ package — everything else may
depend on it, never the reverse.
