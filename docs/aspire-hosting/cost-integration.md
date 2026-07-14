# workspec-cost Aspire hosting integration

`Aspire.Hosting.Workspec.Cost` (`aspire-hosting/aspire-hosting-cost`, slice A5,
[#38](https://github.com/FieldstateNZ/workspec-studio/issues/38)) wires the `workspec-cost` CLI
(`packages/cost-studio`) into a .NET Aspire apphost: a dashboard resource exposing
Stocktake/Report/Validate commands over a directory of cost artifacts, plus a publish-time step
that estimates Azure resource costs from the apphost's own provisioning resources.

Unlike [`workspec-c4`](./c4-integration.md) and `workspec-decisions`, `workspec-cost` has **no
serve mode** — every command it exposes (`stocktake`, `validate`, `report`, `plan`, `apply`) is a
one-shot CLI invocation over a directory of YAML artifacts. `WorkspecCostResource` reflects that:
it's a plain custom `Resource`, not an `ExecutableResource`/`ContainerResource` — there's no child
process, no endpoint, nothing for DCP to orchestrate. That distinction matters for one specific,
previously-litigated question: **is it safe to publish this resource's lifecycle `State`
directly?** For A3's C4/Decisions resources (DCP-managed `ExecutableResource`s), the answer was no
— `CustomResourceSnapshot.ComputeHealthStatus` only aggregates health while `State == Running`, and
overriding `State` on top of DCP's own state machine breaks that. `WorkspecCostResource` has no DCP
state machine underneath it to conflict with, so explicitly publishing `Running` via
`ResourceNotificationService` (see the Aspire docs' "Build custom Aspire resources" — the
MailDev/Talking-Clock-style example) is the documented, correct pattern here, not a repeat of that
mistake.

## Quickstart

```csharp
using Aspire.Hosting;

var builder = DistributedApplication.CreateBuilder(args);

builder.AddWorkspecCost("cost", ".workspec/cost")
    .WithSubscriptions("00000000-0000-0000-0000-000000000000")
    .WithPublishCostEstimate();

builder.Build().Run();
```

This adds a `WorkspecCost` resource with three dashboard commands (Stocktake, Report, Validate)
and, via `WithPublishCostEstimate()`, a publish-time step that writes `cost.cost-estimate.json`
(the default file name is `{resourceName}.cost-estimate.json`) alongside the rest of
`aspire publish`'s output.

## Credential requirements

`Stocktake` calls the real Azure Resource Graph / Cost Management APIs (via
`@workspec/cost-provider-azure`'s `createAzureProvider()`), which authenticates through
`@azure/identity`'s `DefaultAzureCredential` chain — environment variables, Workload Identity,
Managed Identity, `az login`, Azure PowerShell, in that order. **`workspec-cost` runs as a child
process of the apphost** (spawned by `Aspire.Hosting.Workspec.WorkspecCliRunner`, shared by every
workspec CLI integration in this repo since A6 — see "Internal implementation note" in
[`c4-integration.md`](./c4-integration.md)) **and inherits the apphost process's environment** — so whatever
credential source is ambient to the apphost itself (your local `az login` session, a CI job's
Workload Identity/Managed Identity, etc.) is exactly what `Stocktake` will use. There is no separate
credential configuration surface on `WorkspecCostResource` — if `az login` (or equivalent) works in
the terminal you run the apphost from, `Stocktake` will use that same session.

### Required roles

Mirrors `@workspec/cost-provider-azure`'s own README:

| Command             | Azure operation                    | Role needed                                  |
| -------------------- | ------------------------------------ | --------------------------------------------- |
| `Stocktake`          | `fetchInventory` (Resource Graph)   | `Reader`                                     |
| `Stocktake`          | `fetchSpend` (Cost Management)      | `Reader` (or `Cost Management Reader`)       |

`Report` and `Validate` never touch Azure at all — they only read the YAML artifacts already on
disk under the resource's configured directory.

## Subscription scope: `WithSubscriptions` is the primary path

`Stocktake` needs one or more Azure subscription ids (`workspec-cost stocktake --subscription
<id>...`). The obvious-sounding idea — "derive it automatically from the apphost's own Azure
resources" — was investigated for this slice and mostly doesn't hold up:

- A subscription id is a **deployment-time ARM scope** concept, not something the Aspire app model
  or the Bicep it generates carries at authoring time. Confirmed empirically while building this
  slice: `AzureEnvironmentResource` exposes only `Location`/`ResourceGroupName`/`PrincipalId` (each
  a deploy-time `ParameterResource`, not a compile-time value) — no subscription. The Bicep Aspire
  generates for a plain `AddAzureStorage(...)` (via
  `AzureProvisioningResource.GetBicepTemplateString()`) references no subscription at all —
  subscription scope is decided entirely outside the Bicep template, at `az deployment sub create
  --subscription <id>` (or equivalent) time, by whatever tool actually deploys it.
- The one place a literal subscription id CAN legitimately appear at authoring time is an explicit,
  uncommon cross-subscription Bicep resource scope override (`AzureBicepResource.Scope.Subscription`).
  `WorkspecCostExtensions.DeriveSubscriptionsFromModel` (internal) does check for this — so if
  something in your apphost happens to set it, `Stocktake` picks it up for free — but don't rely on
  it: it's a narrow, best-effort fallback that finds nothing in the common case (no resource has an
  explicit scope), not a documented feature you configure toward.

**`WithSubscriptions("<id>", ...)` is therefore the primary, expected way to configure this**, not
a fallback for a rare gap:

```csharp
builder.AddWorkspecCost("cost", ".workspec/cost")
    .WithSubscriptions("00000000-0000-0000-0000-000000000000");
```

If `Stocktake` is run with neither an explicit `WithSubscriptions` call nor anything derivable, it
fails cleanly (without even attempting to run the CLI) with a message explaining both possible
causes (no explicit subscriptions, nothing derivable) and pointing at `WithSubscriptions`.

## Command reference

All three commands run `workspec-cost` against the resource's configured directory (the `dir`
argument to `AddWorkspecCost`, resolved eagerly against `AppHostDirectory` at registration time,
same convention as `AddWorkspecC4`).

- **`Stocktake`** — runs `workspec-cost stocktake --subscription <id>... --dir <dir>` for the
  effective subscription set (see above). A missing/unusable CLI, or a CLI exit code other than 0,
  is a `Failure` carrying the CLI's own stderr message. A successful run (`exit 0`) is a `Success`
  whose body is the CLI's own stderr (a drift summary against the previous stocktake, plus which
  files were written) — `stocktake` never prints JSON, so this is surfaced as plain text rather
  than reformatted.
- **`Report`** — runs `workspec-cost report --format json --dir <dir>` (no `--by`: omitting it lets
  the CLI default to the attribution's primary dimension, which the resource has no way to know
  itself without reading the attribution artifact — exactly what the CLI already does). A
  successful run (`exit 0`) parses the `{ rollup, coverage, totals }` JSON payload and renders a
  coverage headline (`coverage[dimension] X% · $Y/mo unattributed · Z resources`) plus a Markdown
  table sorted by amount descending with `unattributed` forced last, re-deriving the same
  presentation `report`'s own `--format table` uses (the JSON payload's bucket order is not itself a
  sorted contract). Missing inventory/attribution artifacts (`exit 2`) surface the CLI's own
  precise stderr message (e.g. `"expected exactly 1 inventory, found 0"`) as the failure — it
  already says exactly what's missing. Malformed/unparseable JSON is a clean `Failure`, never an
  unhandled exception.
- **`Validate`** — runs `workspec-cost validate --json --dir <dir>`. Exit 0/1 both mean the CLI ran
  successfully and printed a diagnostics array (0 = clean, possibly with warnings; 1 = at least one
  error) — a `Success`/`Failure` result carrying a Markdown diagnostics table either way, mirroring
  `workspec-c4`'s own `validate` command exactly. Only a CLI that couldn't run at all, or an
  unparseable `--json` payload, produces a bare failure message without a table.

## Publish-time cost estimate

`WithPublishCostEstimate(string? artifactFileName = null)` registers a step that runs on
`aspire publish`/`aspire deploy` — **never** on `aspire run` (verified empirically, not just
assumed — see "Mechanism" below) — that walks the app model's Azure provisioning resources and
writes a JSON artifact into the publish output directory. The artifact file name defaults to
`{resourceName}.cost-estimate.json` (e.g. `cost.cost-estimate.json`), scoped per resource so two
cost resources with estimates in one apphost can't clobber each other's artifact; pass
`artifactFileName` to override. The resource list is sorted by `(aspireResourceName, bicepSymbol)`
so re-publishing an unchanged apphost yields diff-stable output (only `generatedAt` moves):

```json
{
  "apiVersion": "workspec.dev/cost-estimate/v1",
  "kind": "CostEstimate",
  "metadata": { "generatedAt": "2026-07-14T00:00:00.0000000Z", "apphost": "MyApp.AppHost" },
  "resources": [
    {
      "aspireResourceName": "storage",
      "bicepSymbol": "storage",
      "type": "Microsoft.Storage/storageAccounts",
      "apiVersion": "2024-01-01",
      "sku": { "name": "Standard_GRS", "tier": null, "capacity": null }
    }
  ],
  "summary": { "resourceCount": 1, "unknownSkuCount": 0 }
}
```

The shape loosely borrows from `@workspec/cost-schema`'s `Inventory` artifact (a list of provider
resources keyed by type), but is deliberately its own, simpler shape — at publish time, before
anything is actually deployed, there is no resource group, subscription, location, or ARM resource
id yet, only a resource **type** and (best-effort) **SKU**. A model with no Azure provisioning
resources is a graceful no-op: a log line, no file written.

### Mechanism: the experimental Pipelines API, chosen deliberately (read this before relying on it)

Aspire 13.4.6 offers two publish-time hooks (both confirmed by reflecting the installed
`Aspire.Hosting` 13.4.6 assembly):

- **A stable one**: the `Aspire.Hosting.Publishing.BeforePublishEvent`/`AfterPublishEvent` eventing
  pair — public, non-experimental, raised publish-only by the pipeline executor, with public
  `builder.OnBeforePublish(...)`/`OnAfterPublish(...)` helper extensions.
- **An experimental one**: the `Aspire.Hosting.Pipelines` namespace (`WithPipelineStepFactory` on
  `IResourceBuilder<T>`).

(The `PublishingCallbackAnnotation`/`PublishingContext` API the Aspire docs — "Building custom
deployment pipelines" — describe does not exist in this package version at all.)

`WithPublishCostEstimate` **deliberately uses the experimental Pipelines API**, registering a
per-resource step named `workspec-cost-estimate-{resourceName}` (scoped by resource name — the
pipeline executor keys steps by name, so two unscoped registrations would collide and fail the
publish) that is `requiredBy` the well-known `publish` step. Three reasons, weighed against the
stable events:

1. **Typed output path.** The stable events don't expose the pipeline output path in typed,
   non-experimental form: `--output-path` binds to the `Pipeline:OutputPath` configuration key,
   whose only typed surface is the experimental `PipelineOptions.OutputPath` (the stable
   `PublishingOptions.OutputPath` is the legacy manifest-publisher's option, not the pipeline's).
   An event-based implementation would still be coupled to the same moving surface — just via a
   stringly-typed raw config key, without the compiler's help.
2. **Progress reporting.** A pipeline step participates in `aspire publish`'s own step
   timeline/progress output, where a bare event handler is invisible.
3. **Parity with Aspire itself.** Aspire runs its own Azure Bicep provisioning at publish time as
   pipeline steps — this step slots into the same model.

The cost of that choice is real and worth naming plainly: **the entire `Aspire.Hosting.Pipelines`
namespace is marked `[Experimental("ASPIREPIPELINES001")]`** — "for evaluation purposes only...
subject to change or removal" — confirmed by actually building against it (the compiler raises
`ASPIREPIPELINES001` on every touched type; suppressed narrowly at the exact points of use in
`WorkspecCostPublishEstimateExtensions.cs`, not project-wide). A future Aspire release could change
or remove this API, which would require porting `WithPublishCostEstimate` — accepted churn risk for
v1. **Revisit when Aspire stabilizes the Pipelines surface** — tracked as an A6 consideration under
[#39](https://github.com/FieldstateNZ/workspec-studio/issues/39).

Verified empirically during this slice's development (a real `aspire publish --output-path <dir>`
run against a throwaway apphost, not just read from docs):

- The step only executes for `aspire publish`/`aspire deploy` — never for `aspire run` or a plain
  `dotnet run` on the apphost.
- `PipelineStepContext.ExecutionContext.IsPublishMode` is `true` when the step runs (the step body
  also checks this defensively, at no cost, in case that framework behavior ever changes).
- `IOptions<PipelineOptions>.Value.OutputPath`, resolved from the step's `Services`, is exactly the
  `--output-path` passed to `aspire publish`. If it's ever unavailable (e.g. the step body is driven
  outside a normal `aspire publish` invocation), the artifact falls back to
  `{AppHostDirectory}/cost-estimate/` with a warning logged — not the expected path in real usage.

### SKU extraction: honest and per-type, not uniform

There is no single strongly-typed Azure.Provisioning API for reading a SKU/tier/capacity generically
across resource types — each type (`StorageAccount`, `ServiceBusNamespace`, `RedisCache`, ...) has
its own concretely-typed `Sku` shape, and reading those typed properties (via the documented
`ConfigureInfrastructure(Action<AzureResourceInfrastructure>)` API) requires an
`IResourceBuilder<T>` handle to the ORIGINAL resource builder — which isn't available here: by
publish time, the app model holds plain `IResource` instances, not the builders they were
originally added through.

Instead, `WorkspecCostEstimateExtractor` calls the public, credential-free
`AzureProvisioningResource.GetBicepTemplateString()` — literally the same call Aspire's own
manifest/publish pipeline uses to write `*.bicep` files (verified, also empirically, to run fully
offline with no Azure credentials) — and pattern-matches the resulting Bicep text for `resource
<symbol> '<type>@<version>' = { ... }` declarations and a nested, flat `sku: { name, tier?,
capacity? }` (or bare-string `sku: '...'`) shape. This is a small, honest pattern-matcher over
Aspire's own deterministic, tool-generated Bicep — not a general Bicep parser, and not a claim of
uniform strongly-typed coverage. A resource type whose generated Bicep doesn't expose a SKU in
either recognized shape — or has none at all, e.g. a SQL logical server (`Microsoft.Sql/servers`,
where SKUs live on the child databases/elastic pools) — is recorded as `"sku": null`, never
guessed.

**Parameterized SKUs are also `"sku": null`.** Some integrations generate the SKU as a deploy-time
Bicep parameter rather than a literal — e.g. `AddAzureServiceBus` produces `param sku string =
'Standard'` plus `sku: { name: sku }`. The extractor only reads literals; a sku block whose every
field is a parameter/expression reference is recorded as unknown (`"sku": null`) and counted in
`summary.unknownSkuCount` — reporting the *parameter's default* would be a guess about a value the
deployment can override.

Three more things about the extraction, all confirmed empirically against real generated Bicep:

- **Role-assignment companion resources are excluded.** A single `AddAzureStorage("storage")` call
  — even with no consumer referencing it — already produces a *separate*
  `AzureProvisioningResource` named `storage-roles` in the model, containing only
  `Microsoft.Authorization/roleAssignments` declarations. These are control-plane/IAM constructs,
  never billable infrastructure, so any declaration whose type starts with
  `Microsoft.Authorization/` is filtered out of the estimate.
- **One Aspire resource can yield multiple estimate entries.** A resource that generates more than
  one ARM declaration in its Bicep (e.g. a namespace plus a queue) contributes one estimate entry
  per declaration, all tagged with the same `aspireResourceName`.
- **Known noise: other control-plane children still appear.** Only `Microsoft.Authorization/*` is
  filtered today. Other non-billable control-plane/child declarations an integration may generate —
  `Microsoft.ManagedIdentity/*` identities, `firewallRules`, blob/queue service child configs, and
  the like — currently appear in the artifact with `"sku": null` and inflate `unknownSkuCount`.
  Consumers should treat the resource list as "everything the Bicep declares", not "everything
  billable". Broader type-aware filtering is an A6 consideration.

## Diagnostics/report shapes

`Validate`'s diagnostics array and `Report`'s `{ rollup, coverage, totals }` payload are consumed as
plain JSON via `System.Text.Json` (case-insensitive property matching) — the authoritative shapes
live in `packages/cost-studio/src/cli.ts` (`ValidateDiagnostic`) and `packages/cost-engine/src/types.ts`
(`Rollup`/`Coverage`/`Totals`, via `AttributeResult`) respectively.

## Testing notes

- `aspire-hosting-tests/WorkspecCliRunnerTests.cs` (Core-scoped, shared by every module since the
  A6 runner consolidation) tests the process-execution/diagnostics-parsing/Markdown-table plumbing
  directly; `aspire-hosting-tests/WorkspecCostReportPayloadTests.cs` and
  `WorkspecCostMarkdownFormatterTests.cs` cover this module's own cost-specific report-parsing and
  `FormatReportMarkdown` logic (no dashboard command involved in any of the three).
- `aspire-hosting-tests/WorkspecCostCommandsTests.cs` invokes the actual registered
  `ResourceCommandAnnotation.ExecuteCommand` delegates via a manually-constructed
  `ExecuteCommandContext` (mirroring `WorkspecC4ExtensionsTests`' own `CommandLineArgsCallback`
  invocation pattern) against committed fake-CLI `.sh` fixtures — including the
  missing-subscriptions and malformed-JSON paths.
- `aspire-hosting-tests/WorkspecCostPublishEstimateExtensionsTests.cs` tests the publish step's
  actual body against a real in-memory app model (including a real `AddAzureStorage` resource, so
  the extracted SKU comes from Bicep Aspire itself generated) — not through the experimental
  Pipelines executor, which `DistributedApplicationTestingBuilder` doesn't support driving
  in-process in this Aspire version.
- `aspire-hosting-tests/WorkspecCostRealCliTests.cs` is the one test that needs the real, built
  `@workspec/cost-studio` CLI (`packages/cost-studio/dist/bin.js`) — it self-skips with a message
  when that file doesn't exist, exactly like `WorkspecC4E2ETests` does for `packages/c4-studio`.
  `.github/workflows/ci.yml`'s dotnet job builds `packages/cost-studio` alongside `c4-studio`/
  `decision-studio` before running `dotnet test` (A6, #39), so this test runs for real in CI rather
  than self-skipping.

## Known gaps for a future slice

- **The experimental Pipelines API dependency.** See "Mechanism" above — a deliberate choice over
  the stable `BeforePublishEvent`/`AfterPublishEvent` hooks, made for the typed output path,
  progress reporting, and parity with Aspire's own publish steps. Revisit (A6, #39) when Aspire
  stabilizes the Pipelines surface; a future Aspire release could require porting
  `WithPublishCostEstimate`.
- **The `Aspire.Hosting.Azure` dependency itself.** `aspire-hosting-cost` now references
  `Aspire.Hosting.Azure` solely for the publish-time estimate step (`AzureProvisioningResource`,
  `AzureBicepResource`) — a heavier dependency than the rest of this project needs for its
  CLI-wrapping core. A later slice may split the publish-estimate step into its own sub-package so
  consumers who only want the Stocktake/Report/Validate commands aren't forced to take the Azure
  hosting dependency.
- **Multi-provider SKU shapes.** The Bicep-text extraction approach was validated against Storage
  (real generated Bicep, literal and parameterized SKU variants), and hand-verified against Service
  Bus/App Service/SQL-server-shaped Bicep in unit tests — it has not been validated against every
  Azure hosting integration this repo could reference in the future (Redis, Cosmos DB, Key Vault,
  etc.). Expect `"sku": null` for anything not yet covered by a matching shape, by design, not by
  omission.

## See also

- [`c4-integration.md`](./c4-integration.md) — the C4 module's own Aspire integration, whose
  reviewed patterns (CLI locator, timeout+kill runner, pipe-escaped Markdown tables) this module
  now shares directly via `Aspire.Hosting.Workspec.WorkspecCliRunner` in `aspire-hosting-core`
  (consolidated from three private per-module copies at A6, #39 — this module's own
  `WorkspecCostReportPayload.Parse`/`FormatReportMarkdown` remain here, since no other module has
  an equivalent "report" shape).
- `packages/cost-studio/src/cli.ts` — the `workspec-cost` CLI this integration wraps.
- `packages/cost-provider-azure/README.md` — the Azure credential chain and required RBAC roles
  `Stocktake` depends on.
