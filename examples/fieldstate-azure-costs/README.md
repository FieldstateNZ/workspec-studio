# Example — Fieldstate Azure costs

Worked example for WorkSpec Cost Attribution: the **"fieldstate-azure" demo estate** — 80
resources across 9 resource groups — carried through the full `workspec-cost` loop
(`stocktake → validate → report → plan → apply`), with the attribution ruleset extended to
**100% coverage** on the primary dimension.

This is the same demo estate `@workspec/cost-engine`'s golden fixture uses
(`packages/cost-engine/test/fixtures/demo-estate/`) — see that fixture's own
[`README.md`](../../packages/cost-engine/test/fixtures/demo-estate/README.md) for exactly which
fields are verbatim from the Claude Design handoff prototypes vs. synthesized (resource `id`,
`location`, `subscription`, etc.) to satisfy the Inventory/Spend schema. The inventory and spend
files here are byte-identical copies of that fixture's `demo.inventory.yaml` /
`demo.spend.yaml`. The attribution file is **not** identical — it's extended with three
additional rules (below).

## Artifacts

| File | Artifact |
| ---- | -------- |
| [`fieldstate-azure.inventory.yaml`](./fieldstate-azure.inventory.yaml) | Inventory — 80 resources, 9 resource groups |
| [`fieldstate-azure.spend.yaml`](./fieldstate-azure.spend.yaml) | Spend — one billing period, `2026-07` |
| [`fieldstate-azure.attribution.yaml`](./fieldstate-azure.attribution.yaml) | Attribution — 3 dimensions, 11 rules (`r1`–`r11`), 1 pinned override |
| [`fieldstate-azure.tagplan.yaml`](./fieldstate-azure.tagplan.yaml) | TagPlan — the tagging diff computed from the attribution result |

## Extending to 100% coverage: rules `r9`–`r11`

The golden fixture's attribution (`r1`–`r8` + the `vm-old-jenkins` override) leaves three resource
groups with no rule assigning the primary dimension (`product`): `rg-legacy-misc`,
`rg-client-acme`, `rg-client-kauri`. Everything else resolves `product` via `r1`/`r2`/`r3`/`r5`
(the per-product resource-group rules) or `r4` (the `aks-shared` split); those three groups fall
through to `r8`'s catch-all, which only assigns `costType`/`client`, leaving `product` unresolved.

`product`'s only declared values are `workspec` / `atrium` / `coffers` / `shared` — there is no
client-specific product value declared, so client-delivery infrastructure (`rg-client-acme`,
`rg-client-kauri`) and legacy infrastructure (`rg-legacy-misc`) all bucket under the existing
`shared` value, mirroring the existing pinned override (`vm-old-jenkins` → `product: shared`).
Three new rules, appended after `r8` and before the override, each promote one resource group to
`product: shared` — the exact shape `@workspec/cost-ui`'s promote-to-rule composer produces
(`buildPromotedRule` in `packages/cost-ui/src/format.ts`):

```yaml
- id: r9
  name: promoted-rg-legacy-misc
  match:
    resourceGroup: rg-legacy-misc
  assign:
    product: shared
- id: r10
  name: promoted-rg-client-acme
  match:
    resourceGroup: rg-client-acme
  assign:
    product: shared
- id: r11
  name: promoted-rg-client-kauri
  match:
    resourceGroup: rg-client-kauri
  assign:
    product: shared
```

The `client` dimension is **unaffected** and was already correctly resolved for the two client
groups before this change: every resource under `rg-client-acme` / `rg-client-kauri` carries a
`tags.client` value (`acme-dairy` / `kauri-health` respectively) that `r6` (`tagExists: client` →
`fromTag: client`) already picks up — `r6` runs before `r8`'s catch-all, so `client` was never the
gap. Only `product` needed the three new rules.

`r6`/`r8`/the override/the three declared dimensions are untouched. The file was produced by a
one-off script that round-tripped the copied fixture through `@workspec/cost-schema`'s
`parseAttributionYaml` / `serializeAttributionYaml` (splicing the three rule objects into
`spec.rules` in memory, after `r8`) — never hand-edited — so it stays in this package's canonical
byte-stable serialization.

## Try the loop

The full `workspec-cost` workflow is `stocktake → validate → report → plan → apply`. Steps 2–4
below were run for real against this example directory with the built CLI
(`node packages/cost-studio/dist/bin.js <command> --dir examples/fieldstate-azure-costs`). Steps 1
and 5 need a live Azure subscription, which this worked example doesn't have — they're narrated
below instead, from `packages/cost-studio/README.md`'s own command docs.

### 1. `stocktake` — narrated, not run

```
workspec-cost stocktake --subscription <id> --name fieldstate-azure --period 2026-07
```

Fetches the current inventory + spend from `@workspec/cost-provider-azure` and writes/overwrites
`fieldstate-azure.inventory.yaml` / `fieldstate-azure.2026-07.spend.yaml` in place, printing a
drift summary against whatever was previously committed (or `stocktake: no drift` / nothing on a
first run). This example's inventory and spend files were seeded from the golden fixture rather
than a real stock-take, so there's no live subscription to point this at here — a real run needs
Azure auth; see `docs/cost/azure-setup.md` (written by a sibling task in this module).

### 2. `validate` — real output

```
$ node packages/cost-studio/dist/bin.js validate --dir examples/fieldstate-azure-costs
validate: 4 artifact(s) OK
```

Exit code `0`. This is the four committed files together (inventory, spend, attribution, and the
tag plan generated in step 4) — Zod-valid, and the attribution engine's own diagnostics pass
clean (no warnings).

### 3. `report` — real output

```
$ node packages/cost-studio/dist/bin.js report --dir examples/fieldstate-azure-costs
coverage[product] 100.0% · $0/mo unattributed · 0 resources

Product    $/mo  share%
shared    4,628   35.2%
workspec  3,761   28.6%
atrium    3,343   25.4%
coffers   1,433   10.9%
```

`coverage[product] 100.0%` — every resource's spend resolves on the primary dimension, thanks to
`r9`–`r11` above; `$0/mo unattributed · 0 resources` confirms it.

### 4. `plan` — real output

```
$ node packages/cost-studio/dist/bin.js plan --dir examples/fieldstate-azure-costs --out fieldstate-azure.tagplan.yaml
plan: +234 add · ~3 change · −0 remove · 3 noop
plan: wrote fieldstate-azure.tagplan.yaml
```

Default tag mapping (`--map` not given): `product → fs-product`, `costType → fs-cost-type`,
`client → fs-client`. The written [`fieldstate-azure.tagplan.yaml`](./fieldstate-azure.tagplan.yaml)
is the committed artifact.

### 5. `apply` — narrated, not run

```
workspec-cost apply fieldstate-azure.tagplan.yaml --dry-run
workspec-cost apply fieldstate-azure.tagplan.yaml
```

Reads the plan, finds the inventory matching its `baselineAsOf`, and calls the provider's
`verifyBaseline` against exactly the touched resources before writing anything — if live tags have
drifted since the plan was computed, it refuses (exit `1`) with a drift summary instead of
applying. Only then does it call `applyTags` (or, with `--dry-run`, simulate it with no live
mutation), printing a per-entry log and a summary like `apply: 237 applied · 3 noop · 0 failed`
(the 234 `add` + 3 `change` entries from step 4's plan, plus the 3 pre-existing `noop` entries that
need no write).
As with `stocktake`, there's no live subscription here to actually apply tags against — see
`docs/cost/azure-setup.md` for the Azure auth a real run needs.
