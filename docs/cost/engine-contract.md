# WorkSpec Cost Attribution — the engine contract (normative)

**Status:** normative · **Package:** `@workspec/cost-engine`

This document is adapted from [`packages/cost-engine/README.md`](../../packages/cost-engine/README.md)
— the **primary source**. If this page and the package README (and its tests) ever disagree, the
package README and its tests win; this page is a cross-linked companion, not a fork.

> **Normative contract, in the package's own words:** `@workspec/cost-engine` "defines behaviour
> that a future Rust CLI and WorkSpec Enterprise must match **byte-for-byte**. Identical input
> must yield identical output across any conforming implementation." The committed golden fixture
> (`packages/cost-engine/test/fixtures/demo-estate/*.yaml` +
> `packages/cost-engine/src/__snapshots__/golden.test.ts.snap`) is the cross-implementation
> conformance artifact — a future implementation is conformant precisely when it reproduces that
> snapshot from that fixture.

The engine is pure functions only: no IO, no DOM, no React, no module globals, no
`Date`/`Math.random`. Its only runtime dependency is `@workspec/cost-schema`.

```ts
import { attribute, plan, resolveAttribution } from '@workspec/cost-engine';

const result = attribute(inventory, [spend], attribution);
result.coverage.find((c) => c.isPrimary)?.ratio;
result.rollups.find((r) => r.dimensionId === 'product');

const entries = plan(inventory, attribution, { product: 'fs-product' });
```

## 1. Matching (`matchRule`)

A rule's `match` object **ANDs its present fields**; `{}` matches every resource.

| Field           | Semantics                                                              |
| ---------------- | -------------------------------------------------------------------------- |
| `resourceType`  | Exact match on the resource's `type`.                                   |
| `nameGlob`      | Glob match on `name`. `*` is the only wildcard.                          |
| `resourceGroup` | Glob match on `resourceGroup`. `*` is the only wildcard.                 |
| `subscription`  | Exact match on `subscription`.                                           |
| `tagEquals`     | The named tag is present **and** strictly equal to the given value.     |
| `tagExists`     | The named tag is present (value irrelevant).                             |

Globs compile via `globToRegExp`: split the glob on `*`, regex-escape each part, join with `.*`,
anchor `^…$`. `foo.bar` matches the literal string `foo.bar` only (the `.` is escaped) — `*` is
genuinely the *only* wildcard.

## 2. Resolution: per-dimension first-set-wins (`resolveAttribution`)

Resolution is **per-dimension, not whole-resource**: rules are evaluated in **array order** —
order **is** precedence, top to bottom. For each matching rule, its effects set only the
dimensions **not yet assigned** on that resource; a later matching rule targeting an
**already-assigned** dimension is recorded as **shadowed** on that dimension (naming the winning
rule). A single rule can win one dimension and be shadowed on another for the same resource — this
happens often in the demo fixture (`r8`'s catch-all frequently wins `costType`/`client` while being
shadowed on `product` by an earlier rule).

Every resource gets a full **cascade trace** — `ResourceResolution.trace` — an entry per rule that
**matched** (non-matching rules are omitted and counted in `didNotMatchCount` instead, which is
exactly what lets a UI render "n rules did not match" without listing them):

```ts
interface RuleTraceEntry {
  ruleId: string;
  tookDimensions: string[]; // dimensions this rule was first to assign
  shadowed: { dimensionId: string; winnerRuleId: string }[]; // dimensions it targeted but lost
}
```

`tookDimensions`/`shadowed` are sorted by **dimension declaration order**
(`attribution.spec.dimensions[]` index), not insertion order, so cascade UIs render a stable
column order. A rule whose only effect is a `fromTag` whose tag is absent on this resource still
appears in the trace (it matched) but with **empty** `tookDimensions`/`shadowed` — the tag simply
never fired; this is a third state distinct from "shadowed on every targeted dimension".

This engine has **no concept of a disabled rule** — `Rule` (cost-schema) carries no `enabled`
field. A caller that wants to simulate toggling a rule off (e.g. the Attribution Workbench UI)
filters `attribution.spec.rules` before calling `resolveAttribution`/`attribute`/`plan`.

## 3. Effects

- **`assign: { dim: value }`** — literal value.
- **`split: { dim: { value: ratio, … } }`** — one split-typed assignment on that dimension (≥2
  parts, ratios summing to 1 within `1e-6` — enforced by `@workspec/cost-schema`).
- **`fromTag: { dim: tagKey }`** — assigns the resource's own value of `tagKey`, **only if that
  tag is present**. If the assigned value is not declared in the dimension's `values[]`, the
  engine **still assigns it** and emits an `unknown-dimension-value` warning diagnostic
  (`assign`/`split` cannot hit this — the schema already rejects undeclared values there; only
  `fromTag` reads a dynamic, unchecked value).

> **Reserved value: `"unattributed"`.** Rollups and cross-tabs use the literal string
> `"unattributed"` as the sentinel bucket/cell key for a resource unresolved on a dimension (§7).
> Nothing in the schema forbids naming an actual dimension value `"unattributed"` — it can be
> declared and reached via `assign`/`split` like any other value, read dynamically via `fromTag`,
> or pinned by an override — so the engine still assigns it, but a `reserved-dimension-value`
> warning diagnostic fires whenever it does: a resolved value of `"unattributed"` collides with
> the sentinel, so rollups/cross-tabs can no longer distinguish it from a resource that was never
> resolved on that dimension, even though `coverage` still counts it as attributed.

## 4. Overrides beat rules

`attribution.spec.overrides[]` apply **after** every rule has run, **unconditionally
overwriting** the pinned dimensions — even a dimension a rule already won during the cascade.
Provenance is the literal string `'override'`. `ResourceResolution.overrideTrace` (present iff an
override targets that resource) is a single trailing entry: `{ tookDimensions: string[] }` —
there is no "shadowed" concept for an override (nothing shadows it; it shadows nothing, it just
wins). An override targeting a resource id absent from the inventory emits an
`override-unknown-resource` warning diagnostic and is otherwise a no-op.

## 5. Rule stats

Per rule: `matched` = number of resources whose `match` held; `won` = number of resources where
the rule set (was first to assign) **at least one** dimension.

## 6. Coverage — per dimension, primary is the headline

Coverage is computed **per dimension**: a resource is attributed on dimension `d` iff `d` resolved
(a split counts as attributed). `coverage(d) = attributedSpend / totalSpend`, where `totalSpend`
is the spend joined to inventory resources (`totals.inventorySpend` — orphan/unresolved spend
rows are excluded, since they aren't tied to any resource and therefore can't be attributed on any
dimension). **`dimensions[0]` is the primary dimension** — its `Coverage.isPrimary` is `true`, its
coverage is the headline number, and **"unattributed resources/clusters" means unresolved on the
primary dimension specifically**, not on any dimension.

**Credits and edge cases — do not clamp, do not soften.** `Spend.amount` may be negative (the
schema allows credits/refunds), so `attributedSpend`, `unattributedSpend`, and `totalSpend` can
each be negative, and `ratio` is raw, **unclamped** math — it is not guaranteed to fall within
`[0, 1]`. A net-negative (credit-heavy) unattributed bucket can push `attributedSpend / totalSpend`
above `1`; `ratio` is `1` when `totalSpend` is exactly `0` (including when positive and negative
amounts net to zero), purely to avoid a division by zero. Display layers that want a bounded
percentage should clamp themselves — the engine never does, so the raw ratio stays available for
callers that need it.

## 7. Rollups & cross-tabs — splits distributed by ratio

`rollupBy(dimensionId)` buckets every resource's joined spend by its assignment on that dimension:
a literal assignment contributes its full spend to one bucket; a split contributes
ratio-weighted amounts to each part's bucket; an unresolved dimension contributes to an
**`'unattributed'`** bucket that is always present. `crossTab(rowDim, colDim)` applies the exact
same ratio-distribution treatment on **both** axes (a resource split 60/40 on the row dimension
contributes 60%/40% shares to whichever column cell it lands in). `attribute()` precomputes
`rollups` for every declared dimension and `crossTabs` for the primary dimension against every
other one; call `crossTab()` directly for any other pair.

## 8. Spend joining

A resource's spend is the **sum of every `Spend` row (across every `spendDocs` entry) whose
`resourceId` matches it** — callers pre-filter to the periods they want; the engine sums whatever
rows it is given. A row whose `resourceId` isn't a known inventory resource is an **orphan**: an
`orphan-spend-row` warning diagnostic, counted in `totals.orphanSpend` / `orphans`, and
**excluded** from `resourceSpend` (and therefore from every rollup/coverage/cross-tab). A row
marked `unresolved: true` (schema: carries no `resourceId`) is counted in
`totals.unresolvedSpend` only — it cannot be an orphan and is not diagnosed. Inventory resources
with zero matching spend rows are attributed/covered trivially at `$0` — no diagnostic; the count
is `totals.resourcesWithoutSpend`. `totals.totalSpend` is the grand total across every row given
(`inventorySpend + orphanSpend + unresolvedSpend`); `totals.inventorySpend` is the
rollup/coverage denominator.

**Mixed currency is an ERROR, not a warning.** More than one distinct currency across all rows
given emits a single `mixed-currency` **error** diagnostic; amounts are still summed
**numerically** regardless — a documented limitation, not a conversion. `totals.currencies`
carries every distinct code seen, sorted ascending.

## 9. Diagnostics — structured, never a throw

| Code                         | Severity | Fires when                                                                 |
| ----------------------------- | ---------- | -------------------------------------------------------------------------------- |
| `rule-never-matched`        | info     | A rule's `match` held for zero resources.                                   |
| `rule-never-won`            | info     | A rule matched ≥1 resource but won (took) zero dimensions anywhere.        |
| `unknown-dimension-value`   | warning  | A `fromTag` assigned a value not declared on that dimension.               |
| `override-unknown-resource` | warning  | An override's `resourceId` matches no inventory resource.                  |
| `orphan-spend-row`          | warning  | A spend row's `resourceId` matches no inventory resource.                   |
| `mixed-currency`            | **error** | More than one currency code appears across the spend rows given.          |
| `reserved-dimension-value`  | warning  | A resource resolved a dimension to the reserved value `"unattributed"` (via `assign`, `split`, `fromTag`, or an override) — collides with the rollup/cross-tab sentinel bucket. |

`Diagnostic = { code, severity, message, ruleId?, resourceId?, dimensionId? }`. The engine
**never throws** on well-formed (schema-valid) input — problems always surface here instead.

## 10. Determinism & purity

No `Date`/`Math.random`; inputs (`inventory`, `spendDocs`, `attribution`) are never mutated;
identical inputs always produce deep-equal outputs (`packages/cost-engine/src/property.test.ts`
runs every public entry point over deep-frozen, arbitrarily-permuted inputs and asserts no throw
and no mutation). `resolveAttribution` doesn't take spend at all, so its output is *structurally*
spend-independent; `attribute()`'s output is proven deterministic under spend-row order
permutation.

## Tag-plan diff (`plan` / `buildTagPlan`)

For each inventory resource × each `tagMapping` entry (`dimensionId → tagName`):

- **`desired`** — the resolved value on that dimension. A split serializes via
  `serializeSplitValue`: parts ordered by ratio **descending**, ties broken by value **ascending**,
  joined `value:pct` by `|`, `pct = ratio * 100` with trailing zeros trimmed
  (`0.6` → `"60"`, `0.335` → `"33.5"`). A `fromTag`-resolved value serializes as the plain value
  (no special-casing). Unresolved ⇒ `null`.
- **`current`** — `resource.tags?.[tagName] ?? null`.
- Entries where **both** `current` and `desired` are `null` are **omitted entirely** — there is
  nothing to plan.
- **`action`** follows the `TagPlan` schema's consistency rule (see `schema-spec.md` §5): `add`
  (current null, desired set), `remove` (current set, desired null), `change` (both set,
  different), `noop` (equal).
- Entries are sorted ascending by `(resourceId, tag)` (reusing `@workspec/cost-schema`'s
  `compareTagPlanEntries`).

`plan()` returns bare entries; `buildTagPlan()` wraps them in a complete, schema-valid `TagPlan`
artifact with `spec.baselineAsOf = inventory.spec.asOf` (the drift-check anchor — see
`azure-setup.md`'s verify-before-apply section for how the CLI uses this). Both are pure — no
provider calls; `apply` is what actually writes tags, and lives in
`@workspec/cost-provider`/`@workspec/cost-provider-azure`.

## The golden fixture

`packages/cost-engine/test/fixtures/demo-estate/` — 80 resources, 9 resource groups, 8 rules, 1
pinned override — the "fieldstate-azure" demo estate from the Claude Design handoff prototypes,
translated into schema-valid YAML. The fixture is **generated, not hand-authored**:
`src/demo-estate.fixture.ts` is the single source of truth, and `src/golden.test.ts` asserts the
committed YAML is byte-identical to what `serialize*Yaml(buildDemo*())` produces from that module
— a fixture that drifts from the source data fails CI. `golden.test.ts` pins the headline numbers
with an explicit oracle table (total spend, primary coverage, unattributed clusters, rollups, a
cross-tab column, the `aks-shared` split's contribution, rule stats, and the tag-plan
counts/non-noop diff), then snapshots the full `attribute()` + `buildTagPlan()` output as the
cross-implementation conformance artifact referenced at the top of this page.

[`examples/fieldstate-azure-costs/`](../../examples/fieldstate-azure-costs) carries this same
demo estate one step further — extended with three additional rules to reach 100% coverage on the
primary dimension — as a real, CLI-verified worked example rather than a test fixture.
