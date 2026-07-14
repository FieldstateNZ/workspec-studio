# workspec-c4 Aspire hosting integration

`Aspire.Hosting.Workspec.C4` (`aspire-hosting/aspire-hosting-c4`, slice A3,
[#36](https://github.com/FieldstateNZ/workspec-studio/issues/36)) wires the `workspec-c4` CLI
(`packages/c4-studio`) into a .NET Aspire apphost: a dashboard resource that serves the C4 model
explorer, a graph-sync mechanism that keeps `.workspec/` aligned with the apphost's own resource
graph (via `workspec-c4 import-aspire`, A2), and health checks covering both "is the server up" and
"is the `.workspec/` model itself valid." This doc covers usage; for the underlying contracts see
[`graph-contract.md`](./graph-contract.md) (the `workspec-graph/v1` document `WorkspecGraphDumper`
produces) and [`import-mapping.md`](./import-mapping.md) (how `import-aspire` projects that graph
into `.workspec/`).

## Quickstart

C# apphost:

```csharp
using Aspire.Hosting;

var builder = DistributedApplication.CreateBuilder(args);

builder.AddWorkspecC4("c4", ".workspec")
    .WithGraphSync()
    .WithModelDiagnosticsHealthCheck();

builder.Build().Run();
```

TypeScript apphost (`apphost.mts`, via the ATS-generated SDK — see
[examples/aspire-apphost](../../examples/aspire-apphost/) for a full worked example and the "ATS
codegen status" section below for a caveat on the exact generated shapes):

```typescript
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const c4 = await builder.addWorkspecC4('c4', '.workspec');
await c4.withGraphSync();
await c4.withModelDiagnosticsHealthCheck();

await builder.build().run();
```

Both add a `WorkspecC4` resource to the dashboard: an HTTP endpoint serving the model explorer
(labeled "C4 Explorer"), a liveness health check, three dashboard commands (`validate`,
`render-diagram`, and — once `WithGraphSync` is added — `sync-workspec`), and (with
`WithGraphSync`) an on-run sync against the apphost's own resource graph.

## The drift-gate walkthrough

`WithGraphSync(WorkspecGraphSyncMode mode = WorkspecGraphSyncMode.Check)` is the "keep `.workspec/`
honest" half of the integration. A typical loop:

1. **You change the apphost** — add a resource, rewire a reference, whatever. `.workspec/` on disk
   doesn't know about this yet.
2. **On the next apphost run**, `WithGraphSync`'s `AfterResourcesCreatedEvent` subscriber dumps the
   live `DistributedApplicationModel` (via `WorkspecGraphDumper`, the same producer
   `graph-contract.md` describes) and runs `workspec-c4 import-aspire --mode check` against it. In
   `Check` mode (the default) this **reports, never writes**: if the graph now describes something
   `.workspec/` doesn't reflect, the `WorkspecC4` resource's `workspec.sync` snapshot property
   (visible in the dashboard's resource details pane) becomes `drift(N)`, and each individual
   diagnostic (severity, code, file, message) is logged to the resource's dashboard console — so
   you see exactly what drifted, not just a count. A clean check publishes `in-sync` instead.
3. **You click "Sync .workspec"** in the dashboard (or run it via the Aspire CLI:
   `aspire resource c4 sync-workspec`). This dashboard command always runs `import-aspire --mode
   scaffold` — regardless of what mode `WithGraphSync` was configured with — writing/updating the
   `.workspec/` tree to match the graph, returns a Markdown summary of what changed (the CLI's
   own "wrote/changed N file(s)" lines), and flips `workspec.sync` back to `in-sync`. You can also
   pass `WorkspecGraphSyncMode.Scaffold` to `WithGraphSync` itself to make the *automatic* on-run
   sync write on every run instead of only reporting — most apphosts should prefer the default
   `Check` and use the on-demand command deliberately, so an unreviewed graph change can't silently
   rewrite `.workspec/` files out from under a hand-authored tree.
4. **Next run's check comes back clean** — `workspec.sync` = `in-sync`, zero diagnostics.

Sync outcomes are deliberately a snapshot **property**, never the resource's lifecycle **state**:
Aspire only computes a resource's aggregate health status while its state is `Running`, so a custom
state string like "Drift detected" would null the resource's health, break
`WaitForResourceHealthyAsync`/`WaitFor` gating on the resource, and mask the real Running/Exited
lifecycle on the dashboard. Drift is model metadata, not a lifecycle condition.

A missing or unusable `workspec-c4` CLI never faults apphost startup: the sync degrades to
`workspec.sync` = `unavailable` plus an error-level dashboard console log, exactly like Core's own
`WithWorkspecGraphDump` treats a failed dump as a diagnostic side-effect, not a startup blocker. A
hung CLI can't stall startup either — every CLI run is bounded (60s), after which the process tree
is killed and the run degrades the same way.

### The graph-dump scratch path

Every sync run (on-run subscriber or the on-demand command) dumps the current model to a stable
scratch path before invoking the CLI:

```
{AppHostDirectory}/obj/workspec-c4/{resourceName}.graph.json
```

This is an authoritative, deliberate convention, not an implementation detail: it lives under the
consuming apphost project's own `obj/` directory, which standard .NET tooling already treats as
disposable build output. This repo's own `aspire-hosting/.gitignore` already excludes
`aspire-hosting/**/obj/`; a third-party apphost consuming this package from NuGet in some other repo
gets the same exclusion for free from the universal per-project `obj/` `.gitignore` convention —
this package needs no extra `.gitignore` entry of its own for that case.

## Health-check semantics

Two independent, composable health checks are available:

| Check                                                              | What it answers                                    | Source                                                                              |
| -------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `WithWorkspecHealthCheck("http")` (from `Aspire.Hosting.Workspec.Core`, wired in automatically by `AddWorkspecC4`) | "Is the studio server up?" — an HTTP liveness probe against `GET /api/health`, which always returns `200 {ok:true, dir}` once the process is listening. | `aspire-hosting-core/WorkspecHealthCheckExtensions.cs` |
| `WithModelDiagnosticsHealthCheck()` (opt-in)                        | "Is the `.workspec/` model itself valid?" — polls `GET /api/model`, counts `diagnostics` entries by `severity`, and maps them to a `HealthStatus` via `WorkspecHealthMapper` (`errorCount > 0` → `Unhealthy`; `warningCount > 0` and no errors → `Degraded`; otherwise `Healthy`). | `aspire-hosting-c4/WorkspecC4HealthCheckExtensions.cs` |

Use the liveness check alone if you only care that the dashboard/API is reachable (e.g. gating a
`WaitFor` on it). Add `WithModelDiagnosticsHealthCheck()` when you want the resource's health
status itself to reflect model validity — e.g. so a broken `.workspec/` tree shows up as
`Unhealthy` in the dashboard the same way a crashed container would, not just as a normal-looking
"Running" resource with a quietly-broken model underneath.

`WithModelDiagnosticsHealthCheck` never throws out of its check delegate: an HTTP failure, a
connection refused, a JSON parse failure, or any other exception is caught and reported as
`Unhealthy` with the exception message, never left to escape and fault the health-check
infrastructure itself.

## Command reference

All three commands appear in the dashboard's resource command menu and are also reachable via
`aspire resource <name> <command>` and the Aspire MCP server (both come "for free" once a command
returns a `CommandResultData` payload — no extra wiring needed).

- **`validate`** — runs `workspec-c4 validate --json --dir <workspecDir>`. Exit 0 (no errors) is a
  `Success` result with a Markdown diagnostics table (or a "no diagnostics" message if the array is
  empty); exit 1 (at least one error-severity diagnostic) is a `Failure` result carrying the same
  table. **This is the nuance to remember**: exit 1 is a normal, successful command execution
  reporting a failure *state* — the CLI ran fine and told you something's wrong. It is not a thrown
  exception, and the dashboard/CLI/MCP caller sees a plain failed-result payload with the full
  diagnostic table, not a crash. Only a CLI that couldn't be run at all (missing binary, or exit 2
  usage error) produces a bare failure message without a table.
- **`render-diagram`** — runs `workspec-c4 render aspire-container --dir <workspecDir> --out -`,
  rendering the generated `aspire-container` diagram to stdout as an SVG. The result is kept
  minimal by design: a `Success` message reporting the rendered byte count, not the SVG payload
  itself (dumping a whole SVG into a command result isn't useful signal for this use case). Exit
  non-zero is a `Failure` with the CLI's stderr.
- **`sync-workspec`** (registered by `WithGraphSync`) — always runs `import-aspire --mode scaffold`
  on demand, regardless of the mode `WithGraphSync` itself was configured with. Returns a Markdown
  summary built from the CLI's stderr ("wrote/changed N file(s)", or "No changes." when stderr is
  empty). A missing/unusable CLI is a `Failure` result explaining why, never a thrown exception.

## ATS codegen status

This package's public surface (`AddWorkspecC4`, `WithModelDiagnosticsHealthCheck`, `WithGraphSync`,
plus the `WorkspecC4StudioResource` type) is annotated with `[AspireExport]` per the
["Multi-language integrations"](https://aspire.dev/extensibility/multi-language-integration-authoring/)
guide, and `aspire-hosting/Directory.Build.props` enables the bundled `EnableAspireIntegrationAnalyzers`
analyzer repo-wide. A clean `dotnet build` (warnings-as-errors on) with zero `ASPIREEXPORTxxx`
diagnostics is the primary evidence the exports are well-formed, and is enforced by
`aspire-hosting`'s CI job on every push.

Actually generating the TypeScript SDK (`.aspire/modules/aspire.mjs`) requires the Aspire CLI to
load and scan this assembly, which requires an Aspire CLI whose own bundled `Aspire.Hosting`
version is compatible with the one this package references. Attempting this by hand with the
locally installed **Aspire CLI 13.3.0** against
[`examples/aspire-apphost`](../../examples/aspire-apphost/)'s `aspire.config.json` (pointed at this
package's `.csproj` via the "project references for local development" pattern) fails during
`aspire restore`:

```
error NU1605: Warning As Error: Detected package downgrade: Aspire.Hosting from 13.4.6 to 13.3.0.
error NU1605:  IntegrationRestore -> Aspire.Hosting.Workspec.C4 -> Aspire.Hosting (>= 13.4.6)
error NU1605:  IntegrationRestore -> Aspire.Hosting (>= 13.3.0)
```

The CLI's own internal integration-scanning project (`IntegrationRestore.csproj`, generated
on-the-fly under `~/.aspire/bundle-hosts/`) pins `Aspire.Hosting` to the CLI's own bundled version
(13.3.0), which conflicts under NuGet's warnings-as-errors central package management with this
package's `Aspire.Hosting` `>= 13.4.6` reference (`aspire-hosting/Directory.Packages.props`). This
is exactly the "CLI/SDK version mismatch" scenario Aspire's own docs describe — the documented fix
is `aspire update` to realign the installed CLI to 13.4.6 (not available in this environment at the
time this was written). Until then, **the clean, zero-warning `dotnet build` is the primary,
verified evidence the ATS exports are well-formed** — the actual generated `.d.ts`/`.mjs` shape
(and in particular the exact positional-vs-options-object argument shape for each exported method)
has not been validated against a real generated SDK, and should be checked the next time an Aspire
CLI >= 13.4 is available. `examples/aspire-apphost/apphost.mts` is written from the C# signatures
and the ATS docs' own conventions as a best-effort illustration, not a tested integration.

## See also

- [`graph-contract.md`](./graph-contract.md) — the `workspec-graph/v1` document this integration
  dumps and consumes.
- [`import-mapping.md`](./import-mapping.md) — how `workspec-c4 import-aspire` projects that graph
  into `.workspec/`, including the drift diagnostic codes logged by `WithGraphSync`.
- [`examples/aspire-apphost`](../../examples/aspire-apphost/) — a worked TypeScript apphost example.
