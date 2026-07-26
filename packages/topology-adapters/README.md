# @workspec/topology-adapters

Pure import adapters that turn infrastructure sources into WorkSpec Topology `Resource` artifacts
(`@workspec/topology-schema`'s `ResourceArtifact` shape). Each adapter is a **pure function** from
already-parsed JSON to `{ resources, diagnostics }` (the `aspire` adapter also returns
`connections` — see its own section below) — no filesystem or network IO happens inside this
package. A later CLI/studio phase owns reading a file (or running `terraform show -json` /
compiling a Bicep template / querying Azure Resource Graph / dumping an Aspire apphost graph) and
passing the parsed result in.

## The invariant this package upholds

A **derived** resource (one this package produces) must be the same shape as an **authored** one,
so reconciling the two is a tree-diff, not a translation. Every produced `Resource` sets
`spec.source = { kind: 'derived', from: '<stable provenance string>' }` and otherwise uses only
fields `ResourceSpec` already defines — nothing is invented outside that schema. `from` is:

| Adapter              | `source.from`                                                    |
| -------------------- | ---------------------------------------------------------------- |
| terraform            | the Terraform resource address, e.g. `azurerm_linux_web_app.web` |
| bicep                | the ARM type + name, e.g. `Microsoft.Web/sites:web-app`          |
| azure-resource-graph | the full ARM resource id                                         |
| aspire               | the Aspire resource name (the graph's own unique key)            |

## The four adapters

```ts
import {
  ADAPTERS,
  terraformAdapter,
  bicepAdapter,
  resourceGraphAdapter,
  aspireAdapter,
} from '@workspec/topology-adapters';

const { resources, diagnostics } = terraformAdapter(JSON.parse(terraformShowJsonText));
// or, selecting by name (what a CLI's `--source <name>` flag would do):
const adapter = ADAPTERS['azure-resource-graph'];
```

- **terraform** — consumes `terraform show -json` (state or plan). Walks `values.root_module`
  (falling back to `planned_values.root_module` for a plan document) and every nested
  `child_modules[]` recursively.
- **bicep** — consumes a compiled ARM template (`resources[]` with ARM `type` strings, the output
  of `bicep build`/`az bicep build`).
- **azure-resource-graph** — consumes an Azure Resource Graph query result (`data[]` rows with the
  standard `id`/`type`/`name`/`resourceGroup`/`kind`/`properties` columns).
- **aspire** — consumes a `workspec-graph/v1` document (a .NET Aspire apphost's dumped resource
  graph — see `docs/aspire-hosting/graph-contract.md`). See its own section below: unlike the other
  three, it derives `connections` from the graph's own edge data.

## Shared vendor→kind mapping

All three adapters resolve a vendor type string to the **same** canonical catalog
(`VENDOR_KIND_CATALOG` in `src/vendor-kind-catalog.ts`) — a `{kind, type}` pair keyed by a
vendor-neutral key (`appService`, `sqlDatabase`, …). Each adapter only needs a small
type-string → catalog-key lookup of its own:

- `terraform/terraform-type-map.ts` — Terraform's `azurerm_*` type strings.
- `arm-type-map.ts` — ARM `Microsoft.*/...` type strings, **shared** by the bicep and
  azure-resource-graph adapters (both speak the same ARM type taxonomy).

`Microsoft.Web/sites` (ARM) covers both App Service and Function App; it's disambiguated by the
resource's `kind` property (`"functionapp,linux"` vs `"app,linux"`) rather than by a static table
entry. Terraform's `azurerm_linux_web_app` vs. `azurerm_linux_function_app` already disambiguates
in the type string itself, so no such step is needed there.

## `type` strings must match the authored convention exactly

`type` is not just display text: recon's fallback match (used whenever `source.from` doesn't line
up with an authored resource) is the tuple `(kind, type, resourceGroup, name)`. If a derived
resource's `type` differs from what a human would write by hand for the same resource, recon can't
match them — the import looks like a phantom (derived) plus an orphan (authored) instead of one
resolved resource. So every `VENDOR_KIND_CATALOG` entry's `type` is either copied verbatim from an
authored fixture in `packages/topology-schema/test/fixtures/valid/*.resource.yaml`, or — where no
such fixture exists yet — follows the `'Azure <Product>'` convention those fixtures establish
(`'Private Endpoint'` is the one authored exception, left unprefixed to match).
`vendor-kind-catalog.consumer-contract.test.ts` cross-checks the catalog against those fixtures
directly (not against this package's own copy of anything), so this can't silently drift again.

## Unmapped vendor types: skip + diagnostic, not a best-effort guess

`RESOURCE_KINDS` (in `@workspec/topology-schema`) is a **closed enum** with no "unknown"/"other"
member — inventing one, or guessing a kind for an unrecognised vendor type, would corrupt the one
property every downstream renderer switches on exhaustively. So a vendor type with no catalog entry
produces **no resource** and a single `warning`-severity `Diagnostic` naming the vendor type and its
provenance (`terraform` address / `type:name` / resource id). This is a deliberate, documented
choice, not an oversight — see `unmapped-type-diagnostic.ts`.

## Duplicate slugs are disambiguated, never silently dropped

`metadata.slug` is derived from a resource's name alone (see `toSlug` usage in each `map-*.ts`), so
two resources sharing a name in different resource groups (or, in a bicep template with no resource
group context at all, two same-named resources of any kind) would otherwise both produce the same
slug — silent data loss when written to `.workspec/resources/*.yaml`, since the second file would
overwrite the first. Every adapter runs its mapped resources through
`disambiguateDuplicateSlugs` (`src/disambiguate-duplicate-slugs.ts`, wired in via the shared
`finalizeAdapterOutput` tail) before returning:

1. Every duplicate past the first occurrence gets its `resourceGroup` (or, absent that, its
   `provider`) appended to the slug.
2. A numeric suffix is appended on top of that if the discriminated slug is _itself_ still a
   duplicate (a true duplicate declaration — same name, same resource group).
3. One `warning` diagnostic is emitted per distinct colliding original slug (not one per resource).

This is deliberately silent to reconciliation: recon matches on `source.from` first, falling back
to the `(kind, type, resourceGroup, name)` tuple — neither key involves `metadata.slug` — so
renaming a slug here has no effect on matching.

## `Microsoft.Web/sites` with no `kind` at all: silently defaulted, visibly flagged

`resolveArmCatalogKey` defaults a `Microsoft.Web/sites` resource to App Service unless its `kind`
property mentions `"functionapp"`. When `kind` is **absent entirely** (not just non-`functionapp`),
the bicep and azure-resource-graph mappers additionally emit an `info`-severity diagnostic — a
Function App whose `kind` was stripped or omitted upstream would otherwise import as a mis-typed
App Service with no visible sign anything was guessed. See
`diagnostics/defaulted-web-site-kind-diagnostic.ts`.

## Other judgment calls worth knowing about

- **Terraform slug/name derivation**: both are read from the resource's Azure `name` attribute
  (`values.name`) when present, falling back to the Terraform-local resource name otherwise — not
  unconditionally from the Terraform-local name. This keeps `resourceGroup`/`network` cross-refs
  self-consistent, since those refs are also slugified from Azure-name-shaped attributes
  (`resource_group_name`, `virtual_network_name`). See `terraform/map-terraform-resource.ts`.
- **Network placement** is only inferred where a vendor payload makes it unambiguous: a subnet's
  parent vnet, and a private endpoint's subnet (from `subnet_id`/`properties.subnet.id`). Every
  other kind (e.g. an App Service's VNet integration) is left unset rather than guessed — Terraform
  models that as a separate resource, and ARM/ARG don't expose it on the resource itself.
- **Bicep `resourceGroup` is never set**: an ARM template resource doesn't carry its own deployment
  scope (that's supplied at `az deployment group create` time, outside the template JSON). Terraform
  state (`resource_group_name`) and Azure Resource Graph rows (`resourceGroup` column) do carry it,
  so those two adapters set it.
- **`Microsoft.Cdn/profiles` → Front Door, unconditionally**: Front Door Standard/Premium is
  provisioned as a `Microsoft.Cdn/profiles` resource, the same ARM type generic (non-Front-Door) CDN
  profiles use. A real CDN-only estate would be mis-mapped by this adapter; acceptable for a
  representative-fixture adapter, flagged here for whoever wires this up against real estates.
- **`config` is a curated subset**, not a mirror of every vendor attribute — see
  `extract-arm-config.ts` / `terraform/extract-terraform-config.ts`. `ResourceSpec.config` is an open
  bag by schema, but copying a vendor's full (often large, provider-internal) attribute set would
  defeat the point of a curated view.
- **`toSlug` duplicates `@workspec/schema-core`'s `slugify`** byte-for-byte rather than importing it:
  this package's only workspace dependency is `@workspec/topology-schema` (which doesn't re-export
  `slugify`), so a local copy avoids adding a dependency edge this package doesn't otherwise need.

## The `aspire` adapter

Consumes a `workspec-graph/v1` document — see
[`docs/aspire-hosting/graph-contract.md`](../../docs/aspire-hosting/graph-contract.md) for the
input contract, produced by `aspire-hosting-core`'s `WorkspecGraphDumper`. Unlike the other three
adapters, it is the first with real edge data in its own source payload, so it populates
`AdapterOutput.connections` (see `types.ts`'s doc comment) — the other three leave it `undefined`
("connectivity not observed", the same convention `@workspec/topology-recon`'s
`DerivedTopology.connections` documents on the consuming side). Full rationale lives in
`aspire/aspire-adapter.ts`'s doc comment; summarized here:

### `kind` / `type` / `provider` mapping

| # | Aspire `kind` / `typeName`                                                          | Outcome                                                          |
| - | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1 | `kind: "parameter"`                                                                 | **Skipped** — not infrastructure, silent (no diagnostic).        |
| 2 | `kind: "azure"`, `typeName` in the curated Azure prefix table (`storage`/`search`/`sqlDatabase` — **database only, not the bare server**/`appInsights`/`logAnalytics`/`identity`/`redisCache`/`redisEnterprise`) | `kind`/`type` from the shared `VENDOR_KIND_CATALOG`, `provider: "azure"`. |
| 3 | `kind: "azure"`, not in that table (includes the bare `AzureSqlServerResource`, and Azure's own Service Bus/Event Hubs) | **Unmapped** (warning diagnostic) — never guessed.                |
| 4 | `typeName` starts with `postgres`/`mysql`/`sqlserver`/`mongo`/`oracle`              | `kind: "database"`, curated product name (e.g. `PostgreSQL`), `provider: "aspire"`. |
| 5 | `typeName` starts with `redis`/`valkey`/`garnet`                                    | `kind: "cache"`, curated product name, `provider: "aspire"`.      |
| 6 | `typeName` starts with `rabbitmq`/`kafka`/`nats` (NON-Azure only)                   | **Unmapped** (warning) — no `queue` `ResourceKind` exists yet; documented v0 gap. |
| 7 | `kind: "container"`/`"executable"`/`"project"`/`"unknown"`, or anything else        | `kind: "compute"`, `type` = raw `typeName`, `provider: "aspire"`. |

Row 7's `kind: "unknown"` case additionally emits an `info` diagnostic, since the graph producer
itself couldn't classify the resource. `provider: "aspire"` (for everything except the curated
Azure matches) is a deliberate departure from `ResourceSpec.provider`'s doc comment ("e.g.
azure/aws/gcp") — most Aspire resources aren't cloud resources at all, and mislabelling a local
Postgres container `"azure"` would be worse than introducing a non-cloud provider string. This has
no effect on reconciliation: recon's match tuple is `(kind, type, name)` — `provider` is display
metadata only.

**Azure SQL is split, not collapsed (review fix)**: the real `Aspire.Hosting.Azure.Sql` package
emits TWO resource types for `AddAzureSqlServer().AddDatabase()` — `AzureSqlServerResource` (the
logical server, a connectivity shell) and `AzureSqlDatabaseResource` (the actual database). Only
`AzureSqlDatabaseResource` maps to `sqlDatabase`; the bare server is unmapped, mirroring
terraform/bicep's own precedent of never mapping a bare SQL *server* type — only `.../databases`.
Conflating the two would mislabel the server "Azure SQL Database".

**Azure Redis has three shapes**: `AzureRedisResource`/`AzureRedisCacheResource` →
`redisCache` ("Azure Cache for Redis"); `AzureRedisEnterpriseResource`/`AzureManagedRedisResource`
→ `redisEnterprise` ("Azure Managed Redis"). `classify-aspire-resource.ts`'s prefix matcher picks
the LONGEST matching prefix (not first-declared) specifically so `"AzureRedisEnterpriseResource"` —
which starts with both `azureredis` and the more specific `azureredisenterprise` — always resolves
to the more specific entry regardless of table declaration order.

**Known v0 gap**: message-queue/broker products (RabbitMQ, Kafka, NATS, Azure Service Bus, Azure
Event Hubs) are unmapped because `@workspec/topology-schema`'s `RESOURCE_KINDS` has no `queue`
member yet — adding one is a schema change, out of scope for the slice that added this adapter
(topology v0.1 S2a, workspec-studio#105). RabbitMQ/Kafka/NATS reach `'unmapped'` via
`classify-aspire-resource.ts`'s `ASPIRE_QUEUE_TYPE_NAME_PREFIXES`; Azure Service Bus/Event Hubs
reach the same outcome via the azure-kind branch (absent from its curated table) — a future
`queue`-kind slice needs to extend BOTH tables, not just one.

### Connection derivation

`references[].via` values `connection-string` / `endpoint` / `environment` / `unknown` (the env-
and args-sourced signals — see the graph contract's `references` section) become `class: "primary"`
connections. `wait` (ordering, not dataflow) and `relationship` (an arbitrary author-defined label
whose semantics can't be reliably classified as dataflow vs. purely informational) are excluded —
see `aspire/derive-aspire-connections.ts` for the full rationale. Connections are resolved through
each resource's FINAL, post-collision-disambiguation slug, deduplicated on `(from, to)`, and sorted
for deterministic output independent of the graph's own array order.

**Parent/child relationships are not represented at all**: `@workspec/topology-schema`'s
`ResourceSpec` has no containment/parent-ref field, and `Connection.class` has no "contains" value
(unlike `workspec-c4 import-aspire`, which synthesizes a `contains` edge in its own diagram output —
see `docs/aspire-hosting/import-mapping.md`). Extending either schema is out of scope for this
slice. Both parent and child still import as independent `Resource`s; only the relationship between
them is dropped — a documented limitation, not an oversight.

### A note on `docs/aspire-hosting/import-mapping.md`

That doc is the normative spec for `workspec-c4 import-aspire` (`packages/c4-studio`'s Aspire→C4
projection) specifically, not a generic "any consumer of `workspec-graph/v1`" mapping doc — it does
not cover this package. This adapter's mapping table lives here and in `aspire-adapter.ts`'s doc
comment instead; `docs/aspire-hosting/graph-contract.md` (the shared input contract both consumers
read) has been updated to name this adapter as a second consumer.

## Fixtures

`test/fixtures/` has one representative, hand-written input per adapter (not a real vendor dump):

- `terraform/sample-show.json` — a resource group, App Service, Redis cache, SQL database, private
  endpoint, Front Door, a vnet+subnet nested in a child module, and one unmapped type
  (`azurerm_public_ip`) to exercise the diagnostic path.
- `bicep/sample-template.json` — the ARM equivalent, plus a second `Microsoft.Web/sites` entry to
  exercise the App-Service-vs-Function-App `kind`-based disambiguation, and one unmapped type
  (`Microsoft.Compute/virtualMachines`).
- `resource-graph/sample-result.json` — the fuller catalog (adds storage, search, identity, and
  vault rows) since ARG rows are the cheapest to write by hand.
- `aspire/sample-graph.json` — a project (with an endpoint) referencing a database via
  connection-string, waiting on (not connecting to) a cache, and relating to an Azure Storage
  resource via a custom relationship; an executable referencing the cache via endpoint and a
  Postgres server via an args-sourced bare-resource reference (`via: "unknown"`); a Postgres
  server/database parent-child pair; an unmapped RabbitMQ container; a skipped parameter; and a
  `kind: "unknown"` resource. Covers every `references[].via` value and every `kind` the graph
  contract defines.

Every adapter's test suite asserts the produced resources against `ResourceArtifact.parse()` from
`@workspec/topology-schema` — the thing that actually proves the tree-diff invariant holds.
