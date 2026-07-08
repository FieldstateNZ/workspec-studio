# The C4 module

Browse, validate, and render C4 architecture trees — actors, systems, containers, components,
domains, features, and diagrams — straight from the `.workspec/` files already in your repo. No
database, ever: the YAML under `.workspec/`, versioned by git, is the single source of truth.

| Package               | Path                 | Role                                                                                  |
| --------------------- | -------------------- | ------------------------------------------------------------------------------------- |
| `@workspec/c4-schema` | `packages/c4-schema` | Zod source of truth → TS types, runtime validation, generated JSON Schema             |
| `@workspec/c4-model`  | `packages/c4-model`  | Pure loader/resolver: `.workspec/` tree → one typed `C4Model`, with diagnostics       |
| `@workspec/c4-layout` | `packages/c4-layout` | Deterministic ELK-based auto-layout, with `.layout/` pinning + round-tripping         |
| `@workspec/c4-ui`     | `packages/c4-ui`     | Host-agnostic React components (interactive canvas, deterministic SVG export)         |
| `@workspec/c4-studio` | `packages/c4-studio` | Standalone CLI (`workspec-c4`) + localhost host shell (`validate`, `render`, `serve`) |

## Tree conventions

Every C4 artifact lives under `.workspec/` at your repo root, in a directory named for its
**type**, one file per element:

```
.workspec/
├── system/<slug>.yaml            # singleton — the project's own "System" box
├── actors/<slug>.yaml            # human roles/personas
├── external-systems/<slug>.yaml  # systems outside the boundary
├── containers/<slug>.yaml        # deployable/buildable units
├── components/<slug>.yaml        # pieces inside a container
├── databases/<slug>.yaml         # database elements (shares the container/component/database/queue shape)
├── queues/<slug>.yaml            # message queue elements (same shape)
├── domains/<slug>.yaml           # logical groupings (the container diagram's "logical" lens)
├── features/<slug>.yaml          # product features
├── diagrams/<slug>.yaml          # diagram definitions (nodes + edges by slug reference)
└── diagrams/.layout/<slug>.yaml  # optional — pinned positions + routing for one diagram
```

**Identity is the file path, not an in-file field.** A container at
`.workspec/containers/api-server.yaml` has slug `api-server` — there is no separate `slug:` key
inside the file. Diagrams reference elements the same way: a bare `{ slug: api-server }` node,
or an explicit typed ref `{ container: api-server }` when the bare slug is ambiguous across more
than one kind.

## The `.layout/` contract

A diagram's positions and edge routing are **optional, separate files** —
`.workspec/diagrams/.layout/<diagram-slug>.yaml` — never mixed into the diagram YAML itself:

- **Absent** `.layout/<slug>.yaml`, or one with an empty `nodes` map → the diagram is **fully
  auto-laid-out** every time (`@workspec/c4-layout`'s ELK `layered` algorithm, deterministic:
  identical input always produces identical output).
- **Present**, with an entry for a node → that node's position is **authoritative and never
  moved**; every other (unpinned) node auto-layouts around it, with zero overlaps. Mixed
  pinned/auto is not a special case — it's the same code path as full-auto or full-manual, just
  with a partial `nodes` map.
- **Graduating** from auto to pinned: `serialize(await layoutDiagram(...))` (from
  `@workspec/c4-layout`) turns any positioned result — auto, mixed, or manual — back into a
  `Layout` you can write to `.layout/<slug>.yaml`. The interactive `serve` explorer does this for
  you automatically: drag a node, and its new position (plus the routes of edges touching it)
  is written back through the working tree.
- A `c4-container` diagram's two lenses (logical/deployment) **share one `.layout/` file** — a
  drag in one lens merges into whatever the other lens's pins already were, never clobbering them.

## CLI (`workspec-c4`, from `@workspec/c4-studio`)

> `@workspec/c4-studio` is **not yet published to npm** (trusted-publisher registration for
> this repo is pending — see the root README), so the `npx` commands below 404 today. Until
> first publish, run the CLI from this repo instead:
> `pnpm --filter @workspec/c4-studio exec tsx src/bin.ts <command> …`.

```sh
npx @workspec/c4-studio validate --dir .        # non-zero on any error-severity diagnostic
npx @workspec/c4-studio render system-context   # writes ./system-context.svg
npx @workspec/c4-studio                          # serve the interactive explorer on :4174
```

### `validate [--dir <path>] [--json] [--strict]`

Loads the tree, prints every diagnostic as `file:line: [severity] code message (slug)` to
stderr (line omitted for diagnostic codes that are inherently file-only — see
`@workspec/c4-model`'s `DIAGNOSTIC_CODES` doc comment for the full carries-line rationale).
Exits `1` on any **error**-severity diagnostic; warnings alone don't fail the run unless
`--strict` is given. `--json` additionally prints the diagnostics array to stdout. An empty or
missing `.workspec/` directory is a clean, zero-diagnostic pass — not an error.

### `render <diagram-slug> [--dir <path>] [--out <file>] [--theme light|dark]`

Lays the named diagram out (honouring `.layout/` pins) and renders it to a standalone,
self-contained SVG — no React runtime, no external stylesheet. **Deterministic**: the same tree
always produces byte-identical output, which is what makes committing rendered SVGs to a repo
(see the root README's Architecture section) an honest, diffable artifact rather than a
guess. Writes to `--out` (default `<diagram-slug>.svg`), or stdout with `--out -`.

### `serve [--dir <path>] [--port <n>] [--host <addr>]` — the default command

Runs the localhost host shell: browse every diagram in a left tree nav, drill down (click an
element whose slug matches another diagram's own slug), and — with the default
`editLayout: true` capability — drag a node to pin it, writing `.layout/` back into the working
tree in real time.

## Editor IntelliSense

Every artifact opens with a `yaml-language-server` directive binding it to a JSON Schema, so a
good editor (the RedHat YAML extension and compatible tooling) gives you completion, hover
docs, and inline validation as you type:

```yaml
# yaml-language-server: $schema=https://schema.workspec.io/v1alpha1/c4/container.schema.json
type: container
title: API Server
description: Express API serving the web client and MCP server.
technology: Node.js
```

> Some authoring rules — the links-entry shape, the `~/`/`@workspace/` path-ref prefix rule, the
> layout viewport's positive-zoom constraint — live in a Zod `superRefine` that JSON Schema
> cannot express. The editor won't red-squiggle a violation of these; `workspec-c4 validate`
> (or any `parse*Yaml` call) will. See `packages/c4-schema`'s own README/drift-log for the full
> list.

## CI

A minimal GitHub Actions job that fails a PR on any invalid artifact and keeps rendered SVGs
fresh (works **once `@workspec/c4-studio` is published** — the `npx` steps 404 until then):

```yaml
# .github/workflows/c4.yml
name: C4

on:
  pull_request:
    paths:
      - '.workspec/**'

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx --yes @workspec/c4-studio validate --dir . --strict
      - run: npx --yes @workspec/c4-studio render system-context --dir . --out /tmp/system-context.svg
      - run: npx --yes @workspec/c4-studio render container --dir . --out /tmp/container.svg
```

This repo's own gate is a package test instead of a separate workflow (see
`packages/c4-studio/src/dogfood.test.ts`, run by the ordinary root `pnpm run test`): it asserts
`workspec-studio`'s own `.workspec/` tree validates with zero diagnostics, and that
`docs/c4/studio-*.svg` are byte-identical to re-rendering the tree right now — determinism turns
that comparison into an honest staleness gate. Regenerate the committed SVGs with
`pnpm run render:c4` (root script) any time `.workspec/` changes.

## Drift log

Every place this module's schemas/CLI/UI knowingly diverge from WorkSpec Enterprise's own code,
or from the original public issue text, is recorded in [`drift-log.md`](drift-log.md) — read it
before assuming a gap here is a bug rather than a reviewed decision.
