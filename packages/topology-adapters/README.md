# @workspec/topology-adapters

Pure import adapters that turn infrastructure sources into WorkSpec Topology `Resource` artifacts
(`@workspec/topology-schema`'s `ResourceArtifact` shape). Each adapter is a **pure function** from
already-parsed JSON to `{ resources, diagnostics }` — no filesystem or network IO happens inside
this package. A later CLI/studio phase owns reading a file (or running `terraform show -json` /
compiling a Bicep template / querying Azure Resource Graph) and passing the parsed result in.

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

## The three adapters

```ts
import {
  ADAPTERS,
  terraformAdapter,
  bicepAdapter,
  resourceGraphAdapter,
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

Every adapter's test suite asserts the produced resources against `ResourceArtifact.parse()` from
`@workspec/topology-schema` — the thing that actually proves the tree-diff invariant holds.
