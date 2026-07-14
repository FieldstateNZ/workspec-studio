# The Cost Attribution module

Stock-take a cloud estate, attribute its spend to your own dimensions (product, team, cost
type, client — whatever you declare), see coverage and rollups, and compute/apply the tagging
diff that converges live tags on the attribution result — straight from plain YAML artifacts
that live in your repo and version with git. No database, ever: the artifacts under your working
tree are the single source of truth, exactly like the Decision and C4 modules.

| Package                         | Path                           | Role                                                                                                                                                                                                 |
| ------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@workspec/cost-schema`         | `packages/cost-schema`         | Zod source of truth for the four artifact kinds (Inventory, Spend, Attribution, TagPlan) — TS types, runtime validation, generated JSON Schema, byte-stable YAML serialization.                      |
| `@workspec/cost-provider`       | `packages/cost-provider`       | Pluggable cost-data provider contract: the `CloudProviderPort` interface, vendor-neutral result types (`ApplyResult`, `DriftReport`), and a stateful in-memory test double (`createMemoryProvider`). |
| `@workspec/cost-provider-azure` | `packages/cost-provider-azure` | Azure implementation of `CloudProviderPort` — Resource Graph inventory, Cost Management spend, ARM tag apply, and drift verification, over plain REST (no `@azure/arm-*` SDKs).                      |
| `@workspec/cost-engine`         | `packages/cost-engine`         | Pure, normative attribution engine (no IO, no DOM, no React) — matching, per-dimension resolution, effects, overrides, coverage, rollups/cross-tabs, tag-plan diff.                                  |
| `@workspec/cost-ui`             | `packages/cost-ui`             | Host-agnostic React views — the unified Attribution Workbench, Inventory, Reports, and Tag-Plan review — themed via a `theme` prop, shipped as a standalone lib **and** a module-federation remote.  |
| `@workspec/cost-studio`         | `packages/cost-studio`         | Standalone CLI (`workspec-cost`) + localhost host shell — `stocktake`, `validate`, `report`, `plan`, `apply`.                                                                                        |

## Conventions

- **Artifacts are plain YAML, discovered by filename suffix** — `*.inventory.yaml`,
  `*.spend.yaml`, `*.attribution.yaml`, `*.tagplan.yaml`. No index, no database. See
  [`schema-spec.md`](schema-spec.md) for the full four-kind spec.
- **Every array that should be order-independent is schema-enforced into one canonical sort
  order**, so a plain `git diff` between two stock-takes (or spend pulls, or tag plans) shows
  only real drift, never noise from discovery order. See schema-spec.md §3.
- **The attribution engine is a byte-for-byte cross-implementation contract.** A future Rust CLI
  or WorkSpec Enterprise must reproduce `@workspec/cost-engine`'s output exactly given the same
  input. See [`engine-contract.md`](engine-contract.md) — the normative source.
- **`workspec-cost` never invokes git.** `stocktake` overwrites a stable path in place; you
  commit, the CLI never does — the same "tooling proposes, git tree disposes" convention the
  Decision and C4 modules use.
- **The Cost UI mounts into an enterprise host over module federation**, the same D5 seam
  `@workspec/decision-ui` and `@workspec/c4-ui` already use — see
  [`mf-host-contract.md`](mf-host-contract.md).

## Quickstart — coverage report in 15 minutes

This is the acceptance bar for this doc: a stranger with nothing but this page should be able to
run a stock-take against their own Azure subscription and reach a coverage report inside 15
minutes.

### 0. Prerequisites

- **Node ≥ 22** (the whole workspace requires it; `@workspec/cost-provider-azure` specifically
  needs it for global `fetch`).
- **An Azure subscription** you can read, and at minimum the **`Reader`** role on it (Resource
  Graph + Cost Management read). Full auth story, required roles, and API versions: see
  [`azure-setup.md`](azure-setup.md).

### 1. Authenticate, then stock-take the estate

```bash
az login   # any DefaultAzureCredential source works — env vars, managed identity, VS Code…
npx @workspec/cost-studio stocktake --subscription <your-subscription-id>
```

> `@workspec/cost-studio` is **not yet published to npm** (same trusted-publisher gate as every
> other `@workspec/*` family in this repo — see the root README), so the `npx` command above
> 404s today. Until first publish, clone this repo and run the CLI from source instead:
>
> ```bash
> git clone https://github.com/FieldstateNZ/workspec-studio.git
> cd workspec-studio
> pnpm install
> pnpm --filter @workspec/cost-studio... build
> pnpm --filter @workspec/cost-studio exec node dist/bin.js stocktake --subscription <your-subscription-id>
> ```

This fetches inventory + spend from Azure and writes `estate.inventory.yaml` and
`estate.<period>.spend.yaml` into the current directory (`--name`/`--period`/`--dir` all have
defaults — see `packages/cost-studio/README.md`). On a first run there's no prior inventory to
diff against, so the drift summary line is skipped entirely — you'll just see the files it wrote.
Run it again later and you'll see something like:

```
stocktake: 4 drifts: +2 appeared · −1 disappeared · ~1 tags changed
```

(or `stocktake: no drift` when nothing moved).

### 2. See the coverage report

```bash
npx @workspec/cost-studio report
# pre-publish: pnpm --filter @workspec/cost-studio exec node dist/bin.js report
```

`report` needs an attribution ruleset alongside the inventory to actually attribute anything — if
you don't have one yet, start from the worked example below rather than authoring rules from
scratch. Once one is in scope, you'll see something like:

```
coverage[product] 81.2% · $2,474/mo unattributed · 20 resources

product         $/mo  share%
workspec       3,761   28.6%
atrium         3,343   25.4%
shared         2,154   16.4%
coffers        1,433   10.9%
unattributed   2,474   18.8%
```

(That is the real output of the demo estate under its base eight rules — the same numbers the
worked example starts from before its extension rules take coverage to 100%.)

The headline always names the **primary** dimension (`attribution.spec.dimensions[0]`) in
brackets, however you rolled the table up with `--by`. Full command reference (`--format
json|csv`, `--by <dimensionId>`) is in `packages/cost-studio/README.md`.

### See it work with zero Azure account

[`examples/fieldstate-azure-costs/`](../../examples/fieldstate-azure-costs) is a complete, real,
CLI-verified worked example — 80 resources, 9 resource groups, extended to **100% coverage** on
the primary dimension — with no cloud account needed at all:

```bash
$ node packages/cost-studio/dist/bin.js validate --dir examples/fieldstate-azure-costs
validate: 4 artifact(s) OK

$ node packages/cost-studio/dist/bin.js report --dir examples/fieldstate-azure-costs
coverage[product] 100.0% · $0/mo unattributed · 0 resources

Product    $/mo  share%
shared    4,628   35.2%
workspec  3,761   28.6%
atrium    3,343   25.4%
coffers   1,433   10.9%
```

Read that example's own README for how it got to 100% coverage (three added rules, `r9`–`r11`)
and for the full `plan` output. It's the fastest way to see `validate`/`report`/`plan` working
end-to-end before you point the CLI at a real subscription.

## Doc index

| Doc                                          | Covers                                                                                                                                                                                 |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`schema-spec.md`](schema-spec.md)           | The four artifact kinds (normative): envelope, file naming, sort-order contract, match grammar, effects, overrides, JSON Schema.                                                       |
| [`engine-contract.md`](engine-contract.md)   | The normative attribution engine contract: matching, resolution, effects, overrides, coverage, rollups/cross-tabs, spend joining, diagnostics, determinism, tag-plan diff.             |
| [`azure-setup.md`](azure-setup.md)           | Azure auth, required roles, API versions, rate limits, the verify-before-apply drift gate, and the live-check script.                                                                  |
| [`mf-host-contract.md`](mf-host-contract.md) | The module-federation contract for mounting `@workspec/cost-ui` at runtime in an enterprise host.                                                                                      |
| [`launch-checklist.md`](launch-checklist.md) | The human runbook: tag-push publish, registry verification, flipping `apps/site`'s workspace exception, the live dogfood, the `npx` acceptance test, and the schema-hosting follow-up. |

## Drift log

Every place this module's schemas/engine/CLI/UI knowingly diverge from a documented convention
(or from an earlier design assumption) belongs in [`drift-log.md`](drift-log.md) — read it before
assuming a gap here is a bug rather than a reviewed decision. Entry 1 (the `apps/site`
workspace-devDependency exception for the unpublished cost packages) is resolved by
`launch-checklist.md` item 3 at first publish.
