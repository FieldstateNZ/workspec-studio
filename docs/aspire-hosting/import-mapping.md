# Aspire → C4 import mapping (`workspec-c4 import-aspire`)

This document is the normative spec for how `workspec-c4 import-aspire` projects a
`workspec-graph/v1` resource graph (dumped by a .NET Aspire apphost) into a `.workspec/` C4 tree.
It covers the classification table, slug rules, edge resolution, `aspire-managed` tag semantics,
`--mode check` drift codes, and the idempotency guarantee. For the input document's shape itself,
see [`docs/aspire-hosting/graph-contract.md`](./graph-contract.md).

The mapping logic lives in one place in code: `packages/c4-studio/src/aspire/classify.ts`
(resource → element kind) and `packages/c4-studio/src/aspire/project.ts` (the full projection —
elements, edges, the system singleton). This document should never drift from that code; if it
does, the code wins and this doc is out of date.

## Command

```
workspec-c4 import-aspire --graph <file> [--dir <path>] [--mode scaffold|check] [--json]
```

- `--graph <file>` (required) — path to a `workspec-graph/v1` JSON document.
- `--dir <path>` — directory containing (or to receive) `.workspec/` (default: cwd).
- `--mode scaffold` (default) — writes the tree.
- `--mode check` — writes nothing; reports drift diagnostics; `--json` prints them to stdout in
  the same shape as `workspec-c4 validate --json`.

Exit codes match the rest of `workspec-c4`: **2** for a usage error (missing/unreadable `--graph`,
an unsupported graph `version`, an invalid `--mode`); for `check`, **0** clean / **1** drift found;
`scaffold` always exits **0** once it has a valid graph (writing files is not itself a failure
condition).

## Classification table

Every resource in `graph.resources` is classified into exactly one outcome, checked in this order:

| # | Condition | Outcome |
| - | --- | --- |
| 1 | `kind: "parameter"` | **Skipped entirely** — no element, not a diagram node, never a valid edge endpoint. Unconditional: a parameter's `typeName` is never consulted. |
| 2 | `typeName` prefix-matches the **database** list (case-insensitive) | `.workspec/databases/<slug>.yaml` |
| 3 | `typeName` prefix-matches the **queue** list (case-insensitive) | `.workspec/queues/<slug>.yaml` |
| 4 | `kind` is `container`, `executable`, or `project` | `.workspec/containers/<slug>.yaml` |
| 5 | `kind: "azure"` | `.workspec/external-systems/<slug>.yaml` |
| 6 | `kind: "unknown"` | `.workspec/containers/<slug>.yaml` (conservative fallback — see below) |

Rows 2–3 (`typeName` classification) are checked **before** row 4/5's `kind`-based rules and win
over them: a Postgres or RabbitMQ resource is `kind: "container"` in Aspire's own model (it's a
Docker container under the hood), but architecturally it's a database/queue, not a generic
container, so it lands in `databases/`/`queues/` instead of `containers/`.

**`typeName` prefix lists** (matched against the start of the lower-cased `typeName`, e.g.
`"PostgresServerResource"` → `postgresserverresource` starts with `postgres`):

- **Database:** `Postgres*`, `SqlServer*`, `MySql*`, `Mongo*`, `Redis*`, `Oracle*`, `Valkey*`,
  `Garnet*`
- **Queue:** `RabbitMq*`, `Kafka*`, `AzureServiceBus*`, `Nats*`, `AzureEventHubs*`

These lists are the single source of truth (`DATABASE_TYPE_NAME_PREFIXES` /
`QUEUE_TYPE_NAME_PREFIXES` in `classify.ts`) and are meant to be extended as Aspire ships new
integrations — that's the only place this classification lives.

### Known heuristic limitations

The `typeName` prefix match is a heuristic, and it has a known blind spot: **admin/companion
tools whose `typeName` starts with a store's prefix classify as the store**. `RedisInsight*` and
`RedisCommander*` resources match the `redis` database prefix, `MongoExpress*` matches `mongo`,
and a Kafka-UI-style container whose `typeName` starts with `Kafka` matches the `kafka` queue
prefix — so these companion web UIs land in `databases/`/`queues/` even though they are
architecturally containers. `import-aspire` deliberately does not special-case them.

To recategorize one, hand-author the element yourself: write an **untagged** element file (no
`aspire-managed` tag) at the path and kind you want. `scaffold` never overwrites an untagged file
occupying a projected path (it reports `skipped-conflict`), and `check` never flags it — the
hand-authored element simply wins. Note that the classification bucket itself (which directory
the projection targets, and the generated diagram node's kind) still follows the heuristic;
extending the prefix lists in `classify.ts` is the only way to change what the projection itself
computes.

**Row 6 (`kind: "unknown"`) is a documented resolution of a contract ambiguity**: the frozen graph
contract enumerates six `kind` values, but the mapping only has explicit rules for
container/executable/project, azure, and parameter — nothing for `unknown`. Rather than silently
dropping resources Aspire itself couldn't classify, `import-aspire` treats an unclassified
`unknown` the same as a generic container. Nothing is ever silently dropped except the
explicitly-skipped `parameter` kind.

### Element content

For `container`/`database`/`queue` (all three share the same `C4Element` schema in
`@workspec/c4-schema`):

```yaml
# yaml-language-server: $schema=<container|database|queue schema URL>
type: container # or database / queue
title: <resource name, verbatim — not humanized>
description: >
  Imported from the Aspire apphost graph as the "<typeName>" resource "<name>".
  Child of Aspire resource "<parent>". # only when `parent` is set AND itself mapped (not skipped)
technology: <image, else command, else omitted> # never set for external-system (no such field)
tags:
  - aspire-managed
source: workspec-c4 import-aspire
```

For `external-system` (its schema has no `technology` field):

```yaml
# yaml-language-server: $schema=<external-system schema URL>
title: <resource name, verbatim>
description: Imported from the Aspire apphost graph as the "<typeName>" resource "<name>".
tags:
  - aspire-managed
source: workspec-c4 import-aspire
```

`title` is the Aspire resource name **as authored**, not humanized/title-cased — this keeps the
projection a pure, predictable function of the input, with no heuristic that could itself drift
or need its own test matrix. `technology` prefers `image` over `command` when a resource has both
(the literal string is kept verbatim; `import-aspire` does not attempt to prettify an image
reference like `docker.io/library/postgres:17` into e.g. `PostgreSQL 17`).

### The system singleton

`import-aspire` ensures the tree has a `system/*.yaml` singleton, titled from `apphost.name` —
**but only creates one when the `system/` directory is completely empty.** An existing system file
(hand-authored or not) is never touched, never overwritten, and never duplicated. The system
schema has no `tags` field, so the created system singleton is **not** `aspire-managed`-tagged and
is **not** governed by `--mode check` — it's a one-time bootstrap convenience, not an ongoing
projection target.

(Note: a `c4-container` diagram's node resolution does not actually require a system element to
validate cleanly with zero diagnostics — the `no-system` diagnostic only fires when a diagram
authors the `__system__` alias, which the generated `aspire-container` diagram never does. The
system singleton is created anyway because every real WorkSpec tree conventionally has one.)

## Slugs

- Slug = `slugify(resource.name)` — lowercase, non-alphanumeric runs collapsed to `-`,
  leading/trailing `-` trimmed, capped at 64 chars (the same `slugify` every other WorkSpec C4
  artifact uses, from `@workspec/c4-schema`).
- **Canonical order**: before any slug/collision/order assignment, the projection sorts
  `graph.resources` by `name` (ordinal). The producer's array order is an implementation detail
  of resource enumeration in the apphost — sorting up front makes every consumer output (slugs,
  collision suffixes, node and edge order, file bytes) independent of it.
- **Collisions** (two resource names that sanitize to the same slug) get a deterministic suffix:
  the first occurrence (in the canonical sorted-by-name order above) keeps the bare slug; the
  second becomes `<slug>-2`, the third `<slug>-3`, and so on. Because the order is derived from
  the names themselves, this suffixing is stable across reruns and across producer reorderings —
  required for idempotency.
- Collision detection is **global** across all mapped resources (not scoped per type-directory),
  even though a same-slug collision across two *different* directories (e.g. a container and a
  queue both slugifying to `cache`) can't actually collide on disk (different files) or produce a
  `duplicate-slug` validation diagnostic (the generated diagram always uses **typed** node refs —
  `{container: <slug>}`, `{database: <slug>}`, etc. — which resolve directly by kind and slug,
  sidestepping the bare-ref ambiguity `duplicate-slug` exists to catch). Global dedup is done
  anyway, as a readability safety net for humans browsing the tree.

## Edge resolution

The generated diagram gets one edge per resolvable `references` entry, plus one synthesized
`contains` edge per mapped parent/child pair (see the `parent` bullet below):

- **Both endpoints must be mapped** (not `kind: parameter`, and present in the graph at all) — an
  edge whose target skipped or doesn't exist in the graph is silently dropped (never rendered as a
  dangling reference; the diagram must validate with zero diagnostics).
- **Self-referencing edges are dropped** (a resource referencing itself in its own `references`).
- **Duplicate edges** (identical `from`/`to`/label) are deduped to one.
- **Label**: the reference's own `label`, when set; otherwise a friendly label derived from `via`:

  | `via` | Label |
  | --- | --- |
  | `connection-string` | "connection string" |
  | `endpoint` | "endpoint" |
  | `environment` | "environment variable" |
  | `wait` | "waits for" |
  | `relationship` | "relationship" |
  | `unknown` | *(no label — the edge is drawn unlabeled)* |

- `category` is deliberately **never set** on generated edges: a `category` naming a key absent
  from the target tree's `spec.yaml` triggers a (warning-level) `unknown-category` diagnostic, and
  the tree isn't guaranteed to have a `spec.yaml` with any particular `connections` entries defined
  — omitting `category` entirely keeps the scaffolded tree at zero diagnostics regardless.
- `parent` **is** used to synthesize a containment edge: the graph producer captures a
  parent/child relationship (e.g. a database sub-resource and its server) **only** in the child's
  `parent` field — `references` stays empty for a plain Postgres-server/child-db pair — so
  `import-aspire` synthesizes `{from: <parent slug>, to: <child slug>, label: "contains"}` for
  every resource whose `parent` names a mapped resource. A `parent` that is itself skipped (a
  parameter) or absent from the graph synthesizes nothing. Synthesized edges are part of the
  desired projection like any reference-derived edge: `--mode check` governs them with the same
  `edge-missing`/`edge-orphaned`/label-drift codes, and they participate in the same
  (from, to, label) dedup. The relationship is additionally folded into the child element's
  `description` as a human-readable note, but the edge is the contract.
- Nodes in the generated diagram are grouped by kind — containers, then databases, then queues,
  then external systems, resource-name order (the projection's canonical order) preserved within
  each group — mirroring this repo's own hand-authored diagram convention. This ordering is
  purely cosmetic and has no bearing on `check`'s comparisons, which are keyed by slug/path, not
  array position.

## The `aspire-managed` tag

Every element `import-aspire` writes (container/database/queue/external-system — **not** the
system singleton, whose schema has no `tags` field) carries `tags: [aspire-managed]`. This tag is
the **entire** governance mechanism:

- **`--mode scaffold`** only ever creates a new file, or updates/leaves alone an existing file
  that already carries this tag. If a file already exists at an element's target path **without**
  the tag, `import-aspire` treats it as hand-authored and never touches it — the scaffold report
  marks that file `skipped-conflict` instead of overwriting it.
- **`--mode check`** only evaluates on-disk files that carry this tag against the graph. A
  hand-authored element sitting at some unrelated path, or even one that happens to collide with a
  path `import-aspire` would want to use, is **never** flagged, as long as it lacks the tag.
- Removing the tag by hand from a previously-generated file is a deliberate, supported way to
  "adopt" it as hand-authored: `import-aspire` will no longer touch or check it (though `scaffold`
  will report `skipped-conflict` on it going forward if the same resource is still in the graph,
  since it no longer recognizes the file as its own).
- **`import-aspire` never deletes.** A resource that disappears from the graph leaves its old,
  still-tagged element file in place — `--mode check` is what surfaces that as `element-orphaned`
  drift for a human to act on; `scaffold` will not clean it up automatically.

### A documented limitation: the generated diagram has no per-edge tag

The diagram schema has no `tags` field, so the file at the reserved `aspire-container` slug can't
carry `aspire-managed` the way elements do. Instead, `import-aspire` recognizes its own diagram by
the **machine-generated marker**: the `# yaml-language-server: $schema=...` directive comment it
always writes as the file's first line. Two consequences:

- **First-write protection**: a pre-existing diagram at `.workspec/diagrams/aspire-container.yaml`
  that **lacks** the marker is treated as hand-authored — `scaffold` never overwrites it (the
  report marks it `skipped-conflict`, exactly like an untagged element occupying an element path),
  and `check` treats it as unmanaged rather than drift-checking it (no edge diagnostics are ever
  reported against it). To let `import-aspire` own the slug, move your diagram to any other slug.
  (Corollary: a hand-authored diagram that happens to begin with the same schema-directive line
  IS treated as machine-generated — keep your own diagrams at other slugs, or without that exact
  first line, if you want them protected.)
- **Within a marked (machine-generated) diagram, hand edits are not preserved**: the file is
  wholly owned — every `scaffold` run fully regenerates its content from the current graph, and
  every `check` run diffs its entire node/edge set. Unlike elements, there is no per-node or
  per-edge tag field to mark "this bit is hand-authored, leave it alone," so **hand edits inside
  a generated `aspire-container.yaml` (an added edge, a tweaked label) are lost on the next
  `scaffold` run** and surface as drift under `check`. If you need permanent hand-authored
  annotations alongside the imported topology, create a **separate** diagram file (any other
  slug) that references the same elements — `import-aspire` only ever touches the file at the
  fixed `aspire-container` slug.

## `--mode check` drift diagnostic codes

`check` never writes. It computes the same desired projection `scaffold` would produce, diffs it
against the tree, and returns a diagnostics array — printed as `file: [severity] code message
(slug)` lines on stderr, and (with `--json`) as JSON on stdout, in the same shape as
`workspec-c4 validate --json`'s own diagnostics array (`severity`, `code`, `message`, `file`, plus
optional `line`/`col`/`slug` — `check` never populates `line`/`col`, since a drift finding isn't
tied to one YAML source position the way a tree-validation finding is).

| Code | Severity | Meaning |
| --- | --- | --- |
| `element-missing` | error | A resource in the graph maps to an element with no file on disk yet — `scaffold` would create it. |
| `element-orphaned` | warning | An on-disk element is `aspire-managed`-tagged, but no resource in the graph maps to it anymore — a candidate for manual cleanup (`scaffold` never deletes it for you). |
| `edge-missing` | error | A desired edge (from a resolvable `references` entry, or a `contains` edge synthesized from a `parent` link) has no corresponding edge in the generated diagram yet. |
| `edge-orphaned` | warning | An edge in the generated diagram no longer corresponds to any reference or parent link in the graph. |
| `field-drift` | warning | A governed element's `title`/`description`/`technology`, or an edge's `label`, differs between what's on disk and what the graph currently desires. |

`element-missing`/`edge-missing` are **errors** (something `scaffold` would *add* — a structural
gap between the graph and the tree); `element-orphaned`/`edge-orphaned`/`field-drift` are
**warnings** (something already exists but is stale — softer, cleanup-oriented signals). Any
finding at all (regardless of severity) makes `check` exit **1**; zero findings is exit **0**.

Only `aspire-managed`-tagged elements are ever inspected for `element-orphaned`/`field-drift` — a
hand-authored file is invisible to `check` entirely, per the tag semantics above. A file that fails
to parse as YAML at all is likewise skipped by `check` (silently — `workspec-c4 validate` is what
surfaces a broken file, not `import-aspire`).

## Idempotency guarantee

Running `--mode scaffold` twice against the **same** graph file is a no-op: no file is rewritten,
because every write is preceded by a byte-for-byte comparison against the desired,
deterministically-serialized content (mirroring `@workspec/cost-schema`'s own byte-stable YAML
convention — fixed key order per schema, `yaml`'s `stringify` with `lineWidth: 0`, no
environment-dependent formatting). This holds because the whole projection
(`packages/c4-studio/src/aspire/project.ts`) is a pure function of the graph — and an
**order-independent** one: resources are sorted by name (ordinal) before any slug, collision
suffix, or node/edge order is assigned, so the same set of resources produces byte-identical
output even if the producer emits them in a different array order.
