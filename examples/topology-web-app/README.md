# Example — Topology Web App

Worked example for WorkSpec Topology Studio: a web app's infrastructure
topology — edge tier, app-tier compute/serverless, and a private-endpoint-
fronted data tier — declared across `dev`/`test`/`prod`, seeded with a
deliberately-drifted **actual** snapshot for `prod` so the full
`workspec-topology` CLI surface (`validate` / `reconcile` / `cost` /
`render`) has something real to exercise end-to-end.

Adapted from the design prototype's "Topology Workbench (drift + cost)"
mockup, `@workspec/topology-schema`'s own `test/fixtures/valid/web-app.*`
fixtures, and `@workspec/topology-recon`'s golden drift scenario
(`test/golden/web-app-drift.fixtures.ts`) — this tree is a new, from-scratch
authoring pass that reconciles all three into one consistent, schema-valid,
CLI-runnable example, not a copy of any one of them.

## Layout

```
.workspec/
  topologies/web-app.yaml          Topology — declared connection graph
  topologies/.layout/web-app.yaml  Per-lens (network / rg) pinned positions
  resources/*.yaml                 15 Resource artifacts
  environments/{dev,test,prod}.yaml
  catalogs/azure-nz.yaml           Pricing catalog (decision-schema Catalog)
topology-actual-demo/
  dev/*.yaml                       Clean "actual" snapshot for dev, incl. an
                                    observed topology.yaml (connectivity captured)
  prod/*.yaml                      Deliberately-drifted "actual" snapshot for
                                    prod, incl. an observed topology.yaml with
                                    one deliberate reroute (connectivity captured)
```

### The topology

```
client ──(prod)──► front-door ──(prod)──► app-service ──► redis-pe ──► cache
  └──(dev/test)───────────────────────────────┤      ├──► sql-pe ──► sql
                                               │      └──► write-fn ──► redis-pe, sql-pe
                                               └──► app-insights (telemetry, from app-service + write-fn)

search        (standalone, no declared connections — the phantom-drift resource)
core-vnet › snet-workload   (network-lens placement for every workload resource)
rg-app / rg-network / rg-data   (resource-group-lens placement)
```

`front-door` is `environments: [prod]` — a real resource-level omission, not
a connection-only trick — so in `dev`/`test` it and both of its connections
(`client→front-door`, `front-door→app-service`) auto-prune per
`@workspec/topology-model`'s `resolve()` contract, and `client→app-service`
(scoped `environments: [dev, test]`) takes over as the public entry point
instead.

## The prod drift scenario

`topology-actual-demo/prod/` is a hand-built "actual deployed state"
snapshot — standing in for what `workspec-topology import` would produce
from a real ARM/Terraform/Resource-Graph export — engineered to reproduce
exactly the design's drift scenario when reconciled against the authored,
prod-resolved topology:

| Class       | Resource(s)    | What differs |
| ----------- | -------------- | ------------ |
| `divergent` | `app-service`  | Authored App Service P1v3 ×2; actual is P0v3 ×1 — downgraded in the portal. |
| `divergent` | `cache`        | Authored Redis Balanced B2, zone-redundant; actual is Basic C1, single-zone. |
| `phantom`   | `search`       | Declared and budgeted; no counterpart exists in the prod actual snapshot at all. |
| `orphan`    | `diag-storage` | Exists in the actual snapshot; declared nowhere under `.workspec/resources/`. |
| `miswired`  | `app-service`, `sql`, `sql-pe` | `app-service` connects directly to `sql`, bypassing the authored `sql-pe` private endpoint (`sql-pe` is still deployed and still matches — it's just no longer wired into the path). |

`topology-actual-demo/prod/topology.yaml` is what makes the `miswired` row
precise rather than a bogus catch-all: it's an OBSERVED topology artifact
(`kind: Topology`) sitting alongside the derived `Resource` files, and its
presence tells `loadDerivedTopology` that connectivity WAS captured for
`prod` — every edge in it mirrors the prod-resolved authored wiring exactly
except the one deliberate `app-service → sql` reroute. Without an observed
topology file, `.topology-actual/<env>/` holds resources only, and
`reconcile` correctly reports **zero** miswired drift (connectivity unknown,
not connectivity-known-and-empty) instead of guessing — see
`@workspec/topology-recon`'s `DerivedTopology.connections` doc comment for
the exact semantics.

`topology-actual-demo/dev/` is the same resource set, minus `front-door`
(correctly absent — it's pruned from dev's *authored* side too) and with
`app-service`/`cache` at their dev-resolved (not drifted) values, PLUS its
own observed `topology.yaml` whose connections match the dev-resolved
authored wiring exactly (no reroute) — so reconciling dev demonstrates the
`front-door` auto-prune producing **no** phantom/orphan noise, and zero
miswired drift too: a clean environment reconciles to nothing, full stop.

## Materializing the actual tree (judgment call)

The repo's root `.gitignore` has `.topology-actual/` (no leading slash — it
matches that directory name anywhere in the tree), and
`workspec-topology reconcile`/`cost` hard-code that exact path
(`.topology-actual/<env>/`, sibling to `.workspec/`) with no `--dir`-relative
override. For a **committed, visible** drift demo those two facts conflict —
so this example keeps its actual snapshots at `topology-actual-demo/<env>/`
(not gitignored) and you materialize them into the path the CLI actually
reads before running `reconcile`/`cost` against drifted state:

```sh
mkdir -p .topology-actual
cp -r topology-actual-demo/dev  .topology-actual/dev
cp -r topology-actual-demo/prod .topology-actual/prod
```

`.topology-actual/` is then gitignored as normal — re-running the copy is
how you "regenerate" it; nothing under it is meant to be hand-edited in
place.

## Verifying (node@22)

From the repo root:

```sh
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
pnpm --filter @workspec/topology-studio build
DEMO=examples/topology-web-app
mkdir -p "$DEMO/.topology-actual"
cp -r "$DEMO/topology-actual-demo/dev"  "$DEMO/.topology-actual/dev"
cp -r "$DEMO/topology-actual-demo/prod" "$DEMO/.topology-actual/prod"

node packages/topology-studio/dist/bin.js validate --dir "$DEMO"
node packages/topology-studio/dist/bin.js reconcile --env prod --dir "$DEMO"
node packages/topology-studio/dist/bin.js reconcile --env dev  --dir "$DEMO"
node packages/topology-studio/dist/bin.js cost --env prod --dir "$DEMO"
node packages/topology-studio/dist/bin.js cost --env dev  --dir "$DEMO"
node packages/topology-studio/dist/bin.js render --env prod --lens network --dir "$DEMO"
node packages/topology-studio/dist/bin.js render --env prod --lens rg      --dir "$DEMO"
```

Expected: `validate` and both `render` calls exit `0`; `cost --env prod` and
`cost --env dev` exit `0` with different totals; `reconcile --env prod` exits
`1` with exactly 5 drifts (2 divergent, 1 phantom, 1 orphan, 1 precise
miswired); `reconcile --env dev` exits **`0`** with **zero** drift — no
phantom/orphan/divergent, and no miswired either — confirming both that the
prod-only `front-door` resource and its two connections auto-pruned cleanly,
AND that a clean environment reconciles to nothing (no false miswired noise).

Verbatim `reconcile --env prod` output:

```
phantom  search: "search" is declared in the authored topology for "prod" but has no counterpart in the deployed state.
orphan   diag-storage: "diag-storage" exists in the deployed state for "prod" but is declared nowhere in the authored topology.
divergent app-service: "app-service" differs from its deployed counterpart in prod: config.tier, cost.sku, cost.qty.
divergent cache: "cache" differs from its deployed counterpart in prod: config.sku, config.tier, config.zoneRedundant, cost.sku.
miswired app-service, sql, sql-pe: Connections differ (declared but not observed: app-service->sql-pe, sql-pe->sql; observed but not declared: app-service->sql).
reconcile: 5 drift(s) — 1 phantom, 1 orphan, 2 divergent, 1 miswired
```

Verbatim `reconcile --env dev` output:

```
reconcile: 0 drift(s) — 0 phantom, 0 orphan, 0 divergent, 0 miswired
```
