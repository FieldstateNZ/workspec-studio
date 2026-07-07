# WorkSpec Decision Schema — v0.1 (`v1alpha1`)

**Status:** draft · **Schema version:** `v1alpha1` · **Package:** `@workspec/decision-schema`

WorkSpec Decision Studio records a costed architecture decision as two plain YAML
artifacts that live in the working tree and version with git:

- a **decision** artifact (`*.decision.yaml`) — the options, criteria, costs and outcome;
- a **catalog** artifact (`*.catalog.yaml`) — the priced tables (pricing modes, schedules,
  SKUs) the cost engine reads.

The schema is defined **once** in Zod (`packages/schema/src`). That single definition yields
three outputs, which are therefore always in sync:

1. **TypeScript types** via `z.infer`;
2. **runtime validation** via `safeParse` (with YAML line/column error mapping);
3. **JSON Schema** (draft 2020-12) for editor IntelliSense, committed under `json-schema/`.

> This document is the human-readable companion to the machine schema. Where they disagree,
> the Zod source and the generated JSON Schema are normative.

---

## 1. File naming (normative)

Artifacts are discovered purely by filename suffix:

| Artifact | Suffix           | Glob                 |
| -------- | ---------------- | -------------------- |
| Decision | `.decision.yaml` | `**/*.decision.yaml` |
| Catalog  | `.catalog.yaml`  | `**/*.catalog.yaml`  |

A file that ends in neither suffix is not an artifact. The repository layer globs the working
tree for these two patterns; there is no index and no database.

## 2. The `$schema` directive

Every artifact SHOULD begin with a `yaml-language-server` directive so editors bind it to the
published JSON Schema for completion and hover docs:

```yaml
# yaml-language-server: $schema=https://schema.workspec.io/v1alpha1/decision.schema.json
```

```yaml
# yaml-language-server: $schema=https://schema.workspec.io/v1alpha1/catalog.schema.json
```

The tooling writes this header automatically. The base URL
`https://schema.workspec.io/v1alpha1/` is the **canonical** location. It is
DNS-gated — it resolves once the Fieldstate org points a CNAME for `schema.workspec.io` at
GitHub Pages. The schemas are published by [`.github/workflows/pages.yml`](../.github/workflows/pages.yml);
until the DNS is in place, the **interim** Pages URL resolves the same `/v1alpha1/` tail:
`https://fieldstatenz.github.io/workspec-decision-studio/v1alpha1/decision.schema.json`,
or point `$schema` at the committed `json-schema/*.schema.json` files directly. The canonical URL
stays the value written into fixtures so it becomes correct the moment DNS lands.

## 3. Common conventions

- Every artifact carries a Kubernetes-style discriminant: `apiVersion: workspec.io/v1alpha1`
  and `kind: Decision | Catalog`.
- **Identifiers** (`id` fields and the ref keys `sku`/`mode`/`schedule`, env keys, criterion
  keys) are slugs matching `^[A-Za-z0-9][A-Za-z0-9_-]*$`.
- **Money** is a plain number in the artifact's `currency` (ISO 4217). Monthly unless noted.
- **Per-environment maps** (`qty`, `amount`) are keyed by environment id; a missing env is 0.
- Unknown properties are rejected (`additionalProperties: false`).

---

## 4. Catalog artifact (`*.catalog.yaml`)

The catalog is the **simple engine pricing model** (porting decision **P3**): the three tables
`compute()` reads. The richer provider/resource/tier/usage model from the prototype is **out of
OSS v1 scope**.

### `metadata`

| Field      | Type       | Req | Description                                                                    |
| ---------- | ---------- | --- | ------------------------------------------------------------------------------ |
| `id`       | identifier | ✓   | Stable catalog id, e.g. `platform`.                                            |
| `name`     | string     |     | Optional human-readable name.                                                  |
| `currency` | string     | ✓   | ISO 4217 currency for all prices, e.g. `NZD`.                                  |
| `asOf`     | string     | ✓   | Date prices were captured, ISO 8601 (kept a string so YAML doesn't coerce it). |

### `spec.pricingModes[]` — a named multiplier on a SKU's PAYG list price

| Field       | Type       | Req | Description                                                                                             |
| ----------- | ---------- | --- | ------------------------------------------------------------------------------------------------------- |
| `id`        | identifier | ✓   | Referenced by a SKU line's `mode`, e.g. `payg`, `ri3`.                                                  |
| `label`     | string     | ✓   | Human-readable name, e.g. `3yr Reserved`.                                                               |
| `short`     | string     |     | Short badge label, e.g. `3Y RI`.                                                                        |
| `mult`      | number ≥ 0 | ✓   | Multiplier on the SKU PAYG monthly list price (`1.0` = list, `0.5` = half).                             |
| `committed` | boolean    | ✓   | If true the mode bills 24×7 and **ignores schedule**; only non-committed modes benefit from scheduling. |
| `note`      | string     |     | Optional note.                                                                                          |

### `spec.schedules[]` — the share of the month a line runs

| Field   | Type        | Req | Description                                                       |
| ------- | ----------- | --- | ----------------------------------------------------------------- |
| `id`    | identifier  | ✓   | Referenced by a SKU line's `schedule`, e.g. `always`, `business`. |
| `label` | string      | ✓   | Human-readable name.                                              |
| `pct`   | number 0..1 | ✓   | Share of the ~730-hour month the line runs (`1` = 24×7).          |
| `note`  | string      |     | Optional note.                                                    |

### `spec.skus[]` — a priced catalogue item

| Field    | Type       | Req | Description                                                    |
| -------- | ---------- | --- | -------------------------------------------------------------- |
| `id`     | identifier | ✓   | Referenced by a SKU line's `sku`, e.g. `d4s_v5`.               |
| `label`  | string     | ✓   | Human-readable name.                                           |
| `family` | string     | ✓   | Grouping family, e.g. `General compute`.                       |
| `price`  | number ≥ 0 | ✓   | Monthly PAYG list price for one unit, in the catalog currency. |
| `unit`   | string     |     | Optional unit label.                                           |

---

## 5. Decision artifact (`*.decision.yaml`)

### `metadata`

| Field        | Type                                     | Req | Description                             |
| ------------ | ---------------------------------------- | --- | --------------------------------------- |
| `id`         | identifier                               | ✓   | Stable decision id, e.g. `dec-hosting`. |
| `title`      | string                                   | ✓   | Decision title.                         |
| `status`     | `exploring` \| `decided` \| `superseded` | ✓   | Lifecycle status.                       |
| `created`    | string                                   |     | Creation date, ISO 8601.                |
| `deciders`   | string[]                                 |     | People accountable.                     |
| `supersedes` | identifier                               |     | Id of a decision this one supersedes.   |

### `spec`

| Field          | Type         | Req | Description                                                                |
| -------------- | ------------ | --- | -------------------------------------------------------------------------- |
| `context`      | string       | ✓   | The problem framing.                                                       |
| `catalog`      | string       | ✓   | **Relative path** to the catalog artifact, e.g. `./platform.catalog.yaml`. |
| `currency`     | string       | ✓   | ISO 4217 currency; should match the catalog.                               |
| `environments` | identifier[] | ✓   | Ordered env ids, e.g. `[dev, test, prod]`.                                 |
| `criteria`     | Criterion[]  | ✓   | Weighted criteria (see below).                                             |
| `options`      | Option[]     | ✓   | The costed options (≥ 1).                                                  |
| `outcome`      | Outcome      |     | Present once decided.                                                      |
| `links`        | Link[]       |     | External references the host resolves.                                     |

### `spec.criteria[]` — Criterion

Weights live on the criterion (porting decision **P4**): the prototype's hardcoded
recommendation weights become data here.

| Field    | Type       | Req | Description                                             |
| -------- | ---------- | --- | ------------------------------------------------------- |
| `id`     | identifier | ✓   | Referenced by option `scores` keys, e.g. `opsBurden`.   |
| `label`  | string     | ✓   | Human-readable name.                                    |
| `hint`   | string     |     | What a high score means.                                |
| `weight` | number ≥ 0 | ✓   | Relative importance in the recommendation (0 disables). |

### `spec.options[]` — Option

| Field          | Type                    | Req | Description                                                    |
| -------------- | ----------------------- | --- | -------------------------------------------------------------- |
| `id`           | identifier              | ✓   | Stable option id, e.g. `aks`.                                  |
| `name`         | string                  | ✓   | Human-readable name.                                           |
| `archetype`    | string                  |     | Short architecture archetype.                                  |
| `summary`      | string                  |     | One-paragraph summary.                                         |
| `tag`          | string                  |     | Short badge, e.g. `current direction`.                         |
| `environments` | identifier[]            | ✓   | Active subset of the decision environments (must be a subset). |
| `complete`     | boolean                 |     | `false` = still being modelled; defaults to complete (P6).     |
| `lines`        | Line[]                  | ✓   | Cost lines (see below).                                        |
| `levers`       | Lever[]                 |     | Declarative what-if toggles.                                   |
| `scores`       | map<criterionId, Score> | ✓   | Per-criterion scores; keys must be declared criteria.          |

**Score:** `{ score: number 0..5, note?: string }`.

### `spec.options[].lines[]` — Line (discriminated union on `flat`)

A line is **either** a metered SKU line **or** a flat line. The boolean `flat` is the
discriminator. Authoring convenience: SKU lines may omit `flat` (it defaults to `false`).

**SkuLine** (`flat: false`)

| Field      | Type                   | Req | Description                                         |
| ---------- | ---------------------- | --- | --------------------------------------------------- |
| `id`       | identifier             | ✓   | Unique within the option.                           |
| `group`    | string                 |     | Display grouping, e.g. `compute`.                   |
| `label`    | string                 | ✓   | Line name.                                          |
| `flat`     | `false`                | ✓*  | Discriminant. May be omitted when authoring.        |
| `sku`      | identifier             | ✓   | Ref to a catalog `skus[].id`.                       |
| `mode`     | identifier             | ✓   | Ref to a catalog `pricingModes[].id`.               |
| `schedule` | identifier             | ✓   | Ref to a catalog `schedules[].id`.                  |
| `tag`      | string                 |     | Tag used by lever `match.tags`, e.g. `steady-prod`. |
| `qty`      | map<envId, number ≥ 0> | ✓   | Units per environment.                              |

**FlatLine** (`flat: true`)

| Field      | Type                   | Req | Description                              |
| ---------- | ---------------------- | --- | ---------------------------------------- |
| `id`       | identifier             | ✓   | Unique within the option.                |
| `group`    | string                 |     | Display grouping.                        |
| `label`    | string                 | ✓   | Line name.                               |
| `flat`     | `true`                 | ✓   | Discriminant.                            |
| `tag`      | string                 |     | Tag used by lever `match.tags`.          |
| `amount`   | map<envId, number ≥ 0> | ✓   | Explicit monthly amount per environment. |
| `estimate` | boolean                |     | Marks the amount as an estimate.         |

### `spec.options[].levers[]` — Lever (declarative patch)

Levers are **declarative data**, not code (porting decision **P1**): the prototype's JS
`match`/`apply` functions become a list of patch ops the engine interprets. A lever with
`enabled: false` is a no-op.

| Field     | Type       | Req | Description                              |
| --------- | ---------- | --- | ---------------------------------------- |
| `id`      | identifier | ✓   | Unique within the option.                |
| `label`   | string     | ✓   | Toggle label.                            |
| `hint`    | string     |     | Explanation.                             |
| `enabled` | boolean    |     | Applied by default? Defaults to `false`. |
| `patch`   | PatchOp[]  | ✓   | Ordered ops applied when enabled (≥ 1).  |

**PatchOp:** `{ match, set?, addLines? }`

- **`match`** — selects lines/envs: `{ tags?: string[], groups?: string[], ids?: identifier[], envs?: identifier[] }`. An empty match matches all lines.
- **`set`** — field mutations on matched **SKU** lines: `{ mode?: identifier, schedule?: identifier, qtyScale?: number ≥ 0 }`.
- **`addLines`** — extra `Line[]` contributed when the lever is enabled.

> `set.mode` / `set.schedule` apply to SKU lines; on a flat line they have no effect (a flat
> line has no mode/schedule). This mirrors the prototype, where scheduling a flat line was a
> cost no-op.

### `spec.outcome` — Outcome

| Field       | Type       | Req | Description                           |
| ----------- | ---------- | --- | ------------------------------------- |
| `option`    | identifier | ✓   | Id of the chosen option (must exist). |
| `rationale` | string     | ✓   | The "we accept X for Y" rationale.    |
| `decidedBy` | string     |     | Who decided.                          |
| `decidedAt` | string     |     | When, ISO 8601.                       |

### `spec.links[]` — Link

`{ kind: string, label: string, target?: string }` — an external reference (deployment,
feature, system-requirement…) the host resolves.

---

## 6. Cross-field validation

Beyond per-field types, the decision schema enforces (via `superRefine`):

- every option `environments` entry is a declared decision environment;
- every per-env `qty`/`amount` key is a declared decision environment ("dangling env key");
- every `scores` key is a declared criterion;
- a recorded `outcome.option` references an existing option.

Catalog **ref integrity** (a line's `sku`/`mode`/`schedule` resolving in the catalog) is **not**
checked here — the schema validates one file at a time and does not load the catalog. The engine
(S2) performs `validateRefs` with the catalog in hand.

---

## 7. Normative notes

- **Discriminated union on `flat`.** A line is a SkuLine or a FlatLine, chosen by `flat`. SKU
  lines may omit `flat`; loaders default it to `false` before discrimination.
- **Levers are declarative patches (P1).** No functions on disk; the engine ships the
  interpreter. Ordered, `enabled: false` is a no-op.
- **Catalog is the simple engine model (P3).** Pricing modes (`mult`, `committed`), schedules
  (`pct`), SKUs (`label`, `family`, `price`). The rich provider/resource model is deferred.
- **Weights are data (P4).** Per-criterion `weight` drives the recommendation; the cost
  coefficient is a normative engine constant (S2), not a schema field.
- **`complete` is authoring state (P6).** `complete: false` lets an option round-trip while it is
  still "Modelling"; the engine also derives completeness from cost.

## 8. Cost model (informative)

The schema carries the inputs; the **engine** (`@workspec/decision-engine`, S2) computes costs.
For reference, the engine's per-line monthly cost for an environment is:

- **flat line:** `amount[env]`
- **SKU line:** `qty[env] × sku.price × mode.mult × effectivePct`, where
  `effectivePct = mode.committed ? 1 : schedule.pct`.

Per-env and annual totals sum active environments; `annual = 12 × monthly`. These rules are
normative in S2 and snapshot-locked against the hosting-platform golden fixture.
