# @workspec/decision-engine

The pure, **normative** cost engine for WorkSpec Decision Studio. It turns an S1
`Decision` plus its externalised `Catalog` into per-line, per-env, per-option
costs, a decision-level roll-up, an optimisation-headroom hint, and a weighted
recommendation.

> **Normative contract.** This package defines behaviour that a future Rust CLI
> and WorkSpec Enterprise must match **byte-for-byte**. **Identical input must
> yield identical output across any conforming implementation.** The committed
> golden snapshot (`src/__snapshots__/golden.test.ts.snap`) is the
> cross-implementation conformance artifact. Any change to an on-disk number is
> deliberate, re-snapshotted, and called out.

Pure functions only: **no IO, no DOM, no React**, no module globals. The catalog
is always passed in (porting decision **P2**: `compute(option)` became
`compute(decision, catalog)`). The only runtime dependency is
`@workspec/decision-schema`.

## Install & use

```ts
import { parseCatalogYaml, parseDecisionYaml } from '@workspec/decision-schema';
import { compute, recommend, validateRefs } from '@workspec/decision-engine';

const decision = parseDecisionYaml(decisionText); // ParseResult<Decision>
const catalog = parseCatalogYaml(catalogText); // ParseResult<Catalog>
if (decision.ok && catalog.ok) {
  const refs = validateRefs(decision.data, catalog.data); // [] = all good
  const result = compute(decision.data, catalog.data);
  result.byOption['aks'].monthly; // 4528.048
  result.cheapestId; // "appsvc"
  recommend(result, decision.data); // "aks"
}
```

## API surface

| Export              | Signature                                                                                                                                                         | Purpose                                                          |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `compute`           | `(decision, catalog) => DecisionCostResult`                                                                                                                       | Cost every option + pick the cheapest complete one.              |
| `computeOption`     | `(option, decision, catalog) => OptionCost`                                                                                                                       | Cost one option (levers applied).                                |
| `applyLevers`       | `(option) => Line[]`                                                                                                                                              | Interpret the option's enabled levers over a clone of its lines. |
| `lineEnvCost`       | `(line, env, catalog) => number`                                                                                                                                  | One line's monthly cost in one environment.                      |
| `validateRefs`      | `(decision, catalog) => RefError[]`                                                                                                                               | Catalog `sku`/`mode`/`schedule` reference integrity.             |
| `recommend`         | `(result, decision) => string \| null`                                                                                                                            | Weighted-fit recommendation over complete options.               |
| `cheapest`          | `(result) => string \| null`                                                                                                                                      | Convenience: `result.cheapestId`.                                |
| `COST_COEFFICIENT`  | `number` (= `3`)                                                                                                                                                  | Normative cost weight in `recommend` (P4).                       |
| `buildAdrModel`     | `(decision, catalog) => AdrModel`                                                                                                                                 | Structured, presentation-agnostic ADR model (see below).         |
| `renderAdrMarkdown` | `(model) => string`                                                                                                                                               | Deterministic Markdown from an `AdrModel`.                       |
| `formatMoney`       | `(value) => string`                                                                                                                                               | Deterministic, locale-free money formatter (P8).                 |
| Types               | `OptionCost`, `DecisionCostResult`, `LineRow`, `RefError`, `RefField`, `AdrModel`, `AdrConsideredOption`, `AdrConsequence`, `AdrDecision`, `AdrLink`, `AdrStatus` | Result + ADR shapes.                                             |

## Shared ADR renderer — one renderer, two consumers

`buildAdrModel(decision, catalog)` turns a decision + its catalog into a
structured, presentation-agnostic `AdrModel`: title, status
(`exploring → Proposed`, `decided → Accepted`, `superseded → Superseded`),
context, the considered options with their computed per-env + annual costs, the
chosen (decided) or recommended (proposed) option, a derived rationale,
consequences (winner criteria with score ≥4 → strength / ≤2 → weakness, plus a
cost premium/headroom line), and links. `renderAdrMarkdown(model)` renders that
model as **deterministic** Markdown — no timestamps, no ambient-locale
formatting; money uses full, stable numbers via `formatMoney` (**P8**).

This is the single renderer behind two consumers: the studio CLI's `render-adr`
(the committed-never generated ADR artifact) and — from S5 — the in-app ADR
view, which reuses `buildAdrModel`. One renderer means the CLI artifact and the
UI can never drift. The rationale is **user-authored** (the decide flow records
`outcome.rationale`); for an as-yet-undecided decision the renderer emits a
neutral, derived "proposed" line — it never invents prose (porting decision
**P7** keeps Atlas/LLM authoring out of OSS v1).

## The normative math

### Per-line, per-env monthly cost — `lineEnvCost(line, env, catalog)`

- **Flat line** → `amount[env] ?? 0`.
- **SKU line** → let `qty = qty[env] ?? 0`; if `qty === 0` return `0`. Look up the
  SKU; **if it is missing return `0`**. Resolve the pricing mode (`mode`) and
  schedule (`schedule`) from the catalog:
  - unknown `mode` defaults to **PAYG** — `mult 1`, `committed false`;
  - unknown `schedule` defaults to **24×7** — `pct 1`.
  - `effectivePct = mode.committed ? 1 : schedule.pct` — **committed modes ignore
    the schedule** (you pay for the reservation 24×7).
  - Return **`sku.price * mode.mult * qty * effectivePct`**, in exactly that
    order of operations. The golden numbers are non-integer floats (e.g. AKS
    prod `2869.048`, whose batch term is `190 × 0.18 × 2 × 0.22`), so the
    order-of-operations is part of the contract.

### Option totals — `computeOption(option, decision, catalog)`

1. `activeEnvs` = the **decision's** environments filtered to the option's, in
   **decision order** (options carry a subset, validated by S1).
2. `applyLevers(option)` first, then cost each lever-applied line per active env.
3. `perEnv[e]` = Σ line costs; `monthly` = Σ `perEnv`; **`annual = monthly * 12`**.
4. `complete = option.complete !== false && monthly > 0` (**P6**).
5. `headroom` — see below (**P5**).

### Levers — `applyLevers(option)` (declarative patch interpreter, P1)

Levers are declarative data, not functions. `applyLevers` clones the option's
lines (**pure — never mutates the input**) and applies each lever with
`enabled === true`, in declaration order; each lever's `patch` ops apply in
order. A lever with `enabled !== true` is a **no-op**. Levers are
catalog-independent (they set line-level mode/schedule ids, scale quantities, or
add lines), so `applyLevers` takes only the option.

For each op, lines are selected by `match` — **facets are OR'd**: a line matches
if its `tag ∈ match.tags`, **or** its `group ∈ match.groups`, **or** its
`id ∈ match.ids`. An empty match (no facets) matches every line. Then:

- `set.mode` / `set.schedule` → replace the **SKU** line's line-level field
  (no-op on flat lines; `match.envs` does **not** scope these — mode/schedule are
  per-line).
- `set.qtyScale` → multiply the SKU line's `qty[env]` by the factor, for the envs
  in `match.envs` (or **all of the option's environments** if `envs` is omitted).
- `addLines` → append these lines to the working set.

### Headroom — the optimisation hint (P5)

Computed on the **lever-applied** lines. For each **SKU** line whose
`qty.prod > 0`, whose post-lever schedule `pct ≥ 0.95` (steady / always-on), and
whose post-lever mode is **not committed**:

```
saving = currentProdCost − sku.price × bestCommittedMult × qty.prod
```

where **`bestCommittedMult` is the lowest `mult` among catalog pricing modes with
`committed: true`** (the normative rule that replaces the prototype's hardcoded
`ri3`; for the hosting-platform catalog it resolves to **`ri3 = 0.50`**). Flat lines and
lines with an unknown SKU are skipped; `"prod"` is the env id literally named
`prod`. `headroom = max(0, Σ savings)`, and `0` if the catalog defines no
committed mode.

### Recommendation — `recommend(result, decision)` (P4)

Over the **complete options only**:

```
fit(option) = Σ over decision.criteria of ( criterion.weight × (scores[id]?.score ?? 0) )
              − COST_COEFFICIENT × (annual / maxAnnual)
```

`maxAnnual` is the maximum `annual` among complete options;
**`COST_COEFFICIENT = 3`** is an exported normative constant (replacing the
prototype's hardcoded cost weight; per-criterion weights now live in
`decision.criteria[].weight`). Returns the option id with the highest `fit`
(ties resolve to decision option order), or `null` if no option is complete.
When every complete option has `annual === 0` the cost term is `0` (no division
by zero).

`cheapest(result)` / `result.cheapestId` is the complete option with the lowest
`annual` (ties → decision order; `null` if none complete).

## Golden numbers (hosting-platform, base = default lever state)

| option |   dev |  test |     prod |  monthly |    annual | headroom | complete |
| ------ | ----: | ----: | -------: | -------: | --------: | -------: | :------: |
| aks    |   792 |   867 | 2869.048 | 4528.048 | 54336.576 |      950 |   true   |
| appsvc | 187.2 | 440.2 |    714.6 |     1342 |     16104 |      124 |   true   |
| ase    |     — |  1575 |     2900 |     4475 |     53700 |     1105 |   true   |
| aca    |   185 |   220 |      775 |     1180 |     14160 |        0 |  false   |

`cheapestId === "appsvc"`, `recommend(...) === "aks"`.

## Tests

| File                   | Covers                                                                                              |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| `src/golden.test.ts`   | Golden snapshot + explicit oracle assertions + cheapest/recommend/validateRefs.                     |
| `src/cost.test.ts`     | `lineEnvCost`, the lever interpreter, `computeOption`, `validateRefs`.                              |
| `src/adr.test.ts`      | `buildAdrModel` / `renderAdrMarkdown` — model shape, golden costs, deterministic Markdown snapshot. |
| `src/property.test.ts` | fast-check: committed modes ignore schedule; all-levers-off = base; single set-lever idempotent.    |

## Scripts

| Script                                              | Does                            |
| --------------------------------------------------- | ------------------------------- |
| `pnpm --filter @workspec/decision-engine build`     | tsup → `dist/` (ESM + `.d.ts`)  |
| `pnpm --filter @workspec/decision-engine typecheck` | `tsc --noEmit`                  |
| `pnpm --filter @workspec/decision-engine test`      | vitest (golden, unit, property) |
