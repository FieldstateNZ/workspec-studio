# WorkSpec Cost Attribution Schema — v0.1 (`v1alpha1`)

**Status:** draft · **Schema version:** `v1alpha1` · **Package:** `@workspec/cost-schema`

WorkSpec Cost Attribution records a cloud estate's inventory, its billed spend, the rules that
attribute that spend to your own dimensions, and the tagging diff needed to converge live tags on
the attribution result — four plain YAML artifacts that live in the working tree and version with
git.

The schema is defined **once** in Zod (`packages/cost-schema/src`). That single definition yields
three outputs, which are therefore always in sync:

1. **TypeScript types** via `z.infer`;
2. **runtime validation** via `safeParse` (with YAML line/column error mapping);
3. **JSON Schema** (draft 2020-12) for editor IntelliSense, committed under `json-schema/` at the
   repo root.

> This document is the human-readable companion to the machine schema, adapted from
> [`packages/cost-schema/README.md`](../../packages/cost-schema/README.md) — the definitive
> source. Where they disagree, the Zod source, the generated JSON Schema, and that package's
> README are normative.

---

## 1. File naming (normative)

Artifacts are discovered purely by filename suffix — no index, no database:

| Artifact    | Suffix               | What it holds                                                          |
| ----------- | --------------------- | ------------------------------------------------------------------------ |
| Inventory   | `*.inventory.yaml`   | A point-in-time stock-take of provider resources.                       |
| Spend       | `*.spend.yaml`       | Billed rows for a period, attributed to resources (or left unresolved). |
| Attribution | `*.attribution.yaml` | Dimensions, ordered rules, and pinned overrides.                        |
| TagPlan     | `*.tagplan.yaml`     | The tagging actions needed to converge on an attribution result.       |

The exported constants `INVENTORY_FILE_SUFFIX` / `SPEND_FILE_SUFFIX` / `ATTRIBUTION_FILE_SUFFIX`
/ `TAGPLAN_FILE_SUFFIX`, their matching globs, and `isInventoryFile()` / `isSpendFile()` /
`isAttributionFile()` / `isTagPlanFile()` are what the repository layer (`@workspec/cost-studio`'s
`FsRepository`) uses to find them.

## 2. The envelope and common conventions

Every artifact carries a Kubernetes-style discriminant, plus a `metadata` block and a `spec`
block:

```yaml
apiVersion: workspec.io/v1alpha1
kind: Inventory   # | Spend | Attribution | TagPlan
metadata: { ... }
spec: { ... }
```

- **Identifiers** (dimension/rule/resource ids, tag keys referenced by id, etc.) follow the same
  slug convention the Decision/Catalog artifacts use.
- **Money** is a plain number, monthly unless the field says otherwise; `Spend.amount` may be
  **negative** (credits/refunds) — see engine-contract.md §6 for how that propagates.
- Unknown properties are rejected.

## 3. The sort-order contract: `git diff` IS the drift report

This is a key selling point of the schema, not an implementation detail. `Inventory.spec.resources[]`,
`Spend.spec.rows[]`, and `TagPlan.spec.entries[]` each have a **mandatory, schema-enforced sort
order**:

- **Inventory resources** — ascending by `id` (plain JavaScript string comparison — UTF-16
  code-unit order; validators and serializers share this comparator).
- **Spend rows** — ascending by `(resourceId ?? sourceLabel, period, serviceCategory)`.
- **TagPlan entries** — ascending by `(resourceId, tag)`.

Validation **rejects** a file whose array isn't already in that order (a `superRefine`, with the
exact issue path pointing at the first out-of-order element). This is deliberate: two stock-takes
(or spend pulls, or tag plans) that differ only in which order resources happened to be discovered
must serialize byte-for-byte identically wherever nothing actually changed, so a plain `git diff`
between them shows **only** meaningful drift — a resource added or removed, an amount that
changed, a tag that needs updating. `src/serialize.ts` produces that canonical order (and
canonical key order, and sorted record/map keys); the Zod schemas reject anything else. Author
tooling — `workspec-cost stocktake`/`plan`, and any future tool — is expected to always go
through the serializer rather than hand-rolling YAML.

**`Attribution.spec.rules[]` is the one array that is *not* resorted**: rule order is match
precedence (§5 below and `engine-contract.md` §2), so the serializer preserves author order there.

## 4. Attribution: dimensions, the match grammar, effects, and overrides

An Attribution artifact declares:

- **`dimensions[]`** — named axes of cost allocation (e.g. `product`, `team`, `costType`), each
  with a fixed set of declared value ids. `dimensions[0]` is the **primary** dimension — the one
  coverage headlines against (`engine-contract.md` §6).
- **`rules[]`** — **ORDERED**. The order in the file is the match precedence: the engine applies
  the first matching rule, independently **per dimension**. Full resolution semantics —
  first-set-wins per dimension, shadowing, the cascade trace — are normative in
  [`engine-contract.md`](engine-contract.md) §§1–3; this section covers only the schema shape.
- **`overrides[]`** — pinned per-resource assignments that beat all rules. Full precedence
  ("overrides beat rules, unconditionally") is normative in `engine-contract.md` §4.

### 4.1 `match` — logical AND across present fields

A rule's `match` object **ANDs its present fields**; an empty object `{}` matches every resource
(a catch-all rule belongs last).

| Field           | Semantics                                                          |
| ---------------- | --------------------------------------------------------------------- |
| `resourceType`  | Exact match on the resource's `type`.                              |
| `nameGlob`      | Glob match on `name`. `*` is the **only** wildcard.                 |
| `resourceGroup` | Glob match on `resourceGroup`. `*` is the only wildcard.            |
| `subscription`  | Exact match on `subscription`.                                     |
| `tagEquals`     | `{ name, value }` — the named tag is present **and** strictly equal to the given value. |
| `tagExists`     | Tag name only — the named tag is present (value irrelevant).       |

Globs compile by splitting on `*`, regex-escaping each remaining part, joining with `.*`, and
anchoring `^…$` — so `foo.bar` matches only the literal string `foo.bar` (the `.` is escaped).
`*` is genuinely the only wildcard; there is no `?`, no character classes, no regex.

### 4.2 Effects — `assign` / `split` / `fromTag`

Every rule needs at least one effect. A given dimension id may appear in at most one effect field
per rule.

| Effect     | Shape                                | Semantics                                                                                          |
| ---------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `assign`   | `{ dim: value }`                     | Literal per-dimension value. `value` must be one of the dimension's declared `values[]`.           |
| `split`    | `{ dim: { value: ratio, ... } }`      | ≥ 2 parts; ratios must sum to **1 within `1e-6`**. Every part's `value` must be declared.           |
| `fromTag`  | `{ dim: tagKey }`                     | Reads the resource's own tag value at run time. **Dynamic** — not checked against declared values at schema time; see `engine-contract.md` §3 for what happens when the tag is absent or the value is undeclared. |

### 4.3 Overrides

`overrides[]` pin one or more dimensions on a specific resource id, beating every rule
unconditionally. The full precedence detail — provenance, the `overrideTrace` shape, what happens
when an override targets an unknown resource — is normative engine behaviour, not schema shape;
see [`engine-contract.md`](engine-contract.md) §4.

## 5. TagPlan: action consistency

Each `TagPlan.spec.entries[]` row is one resource × tag, with `current`/`desired` values (or
`null`) and an `action`. The schema enforces:

| `action`  | Constraint                                  |
| --------- | --------------------------------------------- |
| `add`     | `current` is `null`, `desired` is set.       |
| `remove`  | `current` is set, `desired` is `null`.       |
| `change`  | Both set, and different.                     |
| `noop`    | Both set, and equal.                         |

`current`/`desired` are plain strings with **no character restriction** — the engine may
pre-serialize a split assignment into a tag value like `workspec:60|atrium:40`
(`engine-contract.md`'s Tag-plan diff section), and this schema must not — and does not — forbid
`:` or `|`.

## 6. JSON Schema

Every artifact SHOULD begin with a `yaml-language-server` directive binding it to the published
JSON Schema, so editors give completion, hover docs (every field carries a Zod `.describe(...)`),
and inline validation as you type:

```yaml
# yaml-language-server: $schema=https://schema.workspec.io/v1alpha1/inventory.schema.json
# yaml-language-server: $schema=https://schema.workspec.io/v1alpha1/spend.schema.json
# yaml-language-server: $schema=https://schema.workspec.io/v1alpha1/attribution.schema.json
# yaml-language-server: $schema=https://schema.workspec.io/v1alpha1/tagplan.schema.json
```

**Where the schemas actually live today.** The four cost JSON Schemas already generate **in this
repo, right now**, at `json-schema/inventory.schema.json`, `json-schema/spend.schema.json`,
`json-schema/attribution.schema.json`, and `json-schema/tagplan.schema.json` (verified: `ls
json-schema/` lists all four alongside `decision.schema.json`/`catalog.schema.json`) —
`pnpm --filter @workspec/cost-schema gen:schema` regenerates them, and a vitest drift test
regenerates all four in-memory and asserts byte-equality with the committed files, so CI fails if
they go stale. This is the **same mechanism and the same directory** the decision/catalog schemas
already use — nothing new was needed in this repo for that part. Until the public URL is live, an
editor can point `yaml.schemas` at the committed files directly (see
`packages/cost-schema/README.md`'s IntelliSense section for the exact `.vscode/settings.json`
snippet).

**Getting them served live at `https://schema.workspec.io/v1alpha1/...` is a separate, external
step.** Note, correcting an older doc's framing: `docs/decisions/workspec-decision-schema-v0.1.md`
describes that URL as "DNS-gated," resolved once a CNAME points at this repo's own GitHub Pages,
with an interim `fieldstatenz.github.io/...` fallback. That is **no longer** the mechanism —
schema hosting has moved to a separate repository, `FieldstateNZ/workspec-schemas`
(confirmed in this repo's own [`.github/workflows/pages.yml`](../../.github/workflows/pages.yml)
header comment — "Schema hosting lives in `FieldstateNZ/workspec-schemas`, so this repo's Pages
slot serves the Studio site only" — and in [`apps/site/README.md`](../../apps/site/README.md):
"Schema hosting has moved to `FieldstateNZ/workspec-schemas`"). This repo's Pages workflow now
deploys only `apps/site`. Getting the four cost schemas live at the public URL means syncing them
into that separate repository — a manual/human step this codebase doesn't control or automate.
See [`launch-checklist.md`](launch-checklist.md) item 6 for exactly this open item.
