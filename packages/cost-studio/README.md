# @workspec/cost-studio

WorkSpec Cost Attribution — the standalone `workspec-cost` CLI, and (later) a localhost host
shell, mirroring `@workspec/decision-studio` / `@workspec/c4-studio`.

Part of the Cost Attribution module (in progress — see issues C0–C7). This is the C4 slice: the
filesystem repository (`FsRepository`, implementing `@workspec/cost-schema`'s
`CostRepositoryPort`) and the real `workspec-cost` CLI — `stocktake`, `validate`, `report`, `plan`,
`apply`.

## The workflow

```
workspec-cost stocktake --subscription <id>   # 1. snapshot the estate + its spend
workspec-cost report                           # 2. see coverage + rollup
workspec-cost plan                             # 3. compute the tagging diff
workspec-cost apply <plan-file>                # 4. apply (or --dry-run) the diff
workspec-cost stocktake --subscription <id>    # 5. re-snapshot — tags now match the plan
```

**This CLI never invokes git.** `stocktake` writes to a STABLE path (`<name>.inventory.yaml`) —
re-running it updates the same file in place, so a plain `git diff` on your working tree IS the
drift report between two stock-takes. You commit; `workspec-cost` never does.

## Commands

### `stocktake`

```
workspec-cost stocktake --subscription <id> [--subscription <id>...] \
                         [--name <id>] [--period YYYY-MM] [--dir <dir>]
```

Fetches inventory + spend from the cloud provider (`@workspec/cost-provider-azure` by default) and
writes/overwrites `<name>.inventory.yaml` and `<name>.<period>.spend.yaml`. `--name` defaults to
`estate`; `--period` defaults to the current month. Before overwriting an existing inventory, diffs
old vs new in memory and prints a drift summary, e.g.:

```
stocktake: 4 drifts: +2 appeared · −1 disappeared · ~1 tags changed
```

(or `stocktake: no drift`), followed by the files written. A first stock-take (no prior inventory)
skips the drift line.

### `validate`

```
workspec-cost validate [--dir <dir>]
```

Zod-validates every inventory/spend/attribution/tag-plan artifact under `--dir` (default: the
current directory), printing `ref:line:col: error: message` diagnostics and exiting non-zero on any
schema error. When at least one inventory and one attribution are present, additionally runs the
attribution engine (`@workspec/cost-engine`) over every (inventory, attribution) pairing — joining
any spends found — and prints its diagnostics as non-fatal `ref: warning: [code] message` lines
(exit stays `0` when only warnings fire). Nothing to validate exits `0` quietly.

### `report`

```
workspec-cost report [--by <dimensionId>] [--format table|json|csv] [--dir <dir>]
```

Requires exactly one inventory and one attribution in scope (usage error, exit `2`, otherwise);
joins every spend found. Prints a coverage headline for the **primary** dimension
(`attribution.spec.dimensions[0]`) plus a rollup by `--by` (default: the primary dimension):

```
coverage[product] 81.2% · $2,474/mo unattributed · 20 resources

product        $/mo  share%
atrium        10,234   62.1%
workspec       6,240   37.9%
```

The headline names the dimension in brackets — always the **primary** one, even when `--by` rolls
up a different dimension — so `--by costType` output can't be misread as `costType`'s own coverage.

`--format json` emits the raw engine subset (`{ rollup, coverage, totals }`); `--format csv` emits
rollup rows (`dimension,value,amount,share`). Mixed-currency / orphan-spend-row diagnostics from the
engine print as warnings on stderr regardless of format.

### `plan`

```
workspec-cost plan [--map <dimensionId>=<tagName>]... [--out <file>] [--dir <dir>]
```

Requires exactly one inventory and one attribution in scope (same usage-error convention as
`report`). Computes the tag plan needed to converge live tags on the attribution result
(`@workspec/cost-engine`'s `buildTagPlan`). Every declared dimension defaults to tag
`fs-<kebab-case dimension id>` (e.g. `costType` → `fs-cost-type`, matching the design handoff);
`--map` overrides individual dimensions. Writes to `--out` (default:
`<latest spend period, or the inventory's asOf month>.tagplan.yaml`) and prints a summary:

```
plan: +215 add · ~2 change · −1 remove · 3 noop
```

Exits `1` (no file written) when the plan would be empty **and** nothing resolves on the primary
dimension — almost always a sign the attribution rules need fixing before proceeding.

### `apply`

```
workspec-cost apply <plan-file> [--dry-run] [--dir <dir>]
```

Reads and validates the plan, then finds the inventory whose `asOf` matches the plan's
`baselineAsOf` — refusing (exit `1`) if none is found: re-stocktake and re-plan. It also refuses
(exit `1`, no writes, no `verifyBaseline` call) if **more than one** inventory shares that `asOf` —
an ambiguous baseline is never resolved by picking one arbitrarily; keep exactly one or re-plan.
Otherwise calls the provider's `verifyBaseline` against exactly the resources the plan touches
**first**: if live state has drifted since the plan was computed, it prints the drift and
**refuses** (exit `1`, no writes):

```
apply: refusing — live state has drifted from the plan's baseline inventory (estate.inventory.yaml):
  ~ res-vm-1 tags changed out-of-band
apply: re-stocktake and re-plan before applying
```

Only once verification passes does it call `applyTags` (or, with `--dry-run`, simulate it — no live
resource is mutated), printing a per-entry result log and a summary (`apply: N applied · M noop · K
failed`). Exits `0` iff every entry succeeded.

This verify-then-apply sequence is not a transaction: drift that occurs in the window between the
`verifyBaseline` gate and the writes it triggers is **not** re-checked for `add`/`change` entries;
`remove` entries are the exception, since the provider value-matches them against the live tag at
apply time.

## Testing

- `src/fs-repository.test.ts` — discovery, read/validate, byte-stable write round-trips.
- `src/cli.test.ts` — unit coverage of every command via injected `@workspec/cost-schema`
  `createMemoryRepository` / `@workspec/cost-provider` `createMemoryProvider` doubles.
- `src/acceptance.test.ts` — the full `stocktake → report → plan → apply → re-stocktake` loop
  against a real `FsRepository` on a temp directory (so file naming is exercised) plus an injected
  memory provider; also covers `apply`'s drift-refusal gate and `--dry-run`'s no-mutation guarantee.

## Dependency direction

`cost-studio` depends on `cost-ui`, `cost-engine`, `cost-provider`, `cost-provider-azure`, and
`cost-schema` — the top of the module's dependency graph. `cost-provider-azure` is the CLI's default
live-provider wiring; tests inject `createMemoryProvider` instead.
