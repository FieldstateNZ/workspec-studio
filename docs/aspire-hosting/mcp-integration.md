# workspec-mcp Aspire hosting integration

`Aspire.Hosting.Workspec.Mcp` (`aspire-hosting/aspire-hosting-mcp`) wires the aggregate
`workspec-mcp` CLI (`packages/mcp-host`) into a .NET Aspire apphost: a dashboard resource that runs
the server in `--http` mode over one shared artifacts directory, with its tools proxied through
Aspire's own built-in MCP server.

Unlike `aspire-hosting-decisions`/`aspire-hosting-c4`, `workspec-mcp` has no `serve` subcommand of
its own and no dashboard commands — its only job is to run the aggregate MCP server
(`decisions_*`/`cost_*`/`c4_*`/`trace_*`, 34 tools total) and let Aspire's tooling proxy it.

## Quickstart

```csharp
using Aspire.Hosting;

var builder = DistributedApplication.CreateBuilder(args);

var mcp = builder.AddWorkspecMcp("workspec-mcp", ".");

builder.Build().Run();
```

This adds a `WorkspecMcp` resource to the dashboard: an HTTP endpoint running `workspec-mcp --http
--dir <resolved dir> --port <allocated port> --host 127.0.0.1` (labeled "MCP"), a liveness health
check against `GET /health`, and — via `WithMcpServer("/mcp")` — an `McpServerEndpointAnnotation`
that lets Aspire's own tooling discover and proxy every tool the aggregate server exposes. Once the
apphost is running, `aspire mcp tools` lists them and `aspire mcp call` invokes them, exactly as if
they were tools on Aspire's own dashboard MCP server.

The directory passed to `AddWorkspecMcp` is shared by every provider the aggregate host assembles —
each of decisions/cost/c4/trace reads and writes its own artifact kinds under that one tree (see
`packages/mcp-host/src/cli.ts`). The tool list is **static**: a directory containing only decision
records still exposes all 34 tools; the cost/c4/trace ones simply operate against an empty tree
until matching artifacts appear underneath it.

## `WithMcpServer` is experimental

`WithMcpServer` is gated behind Aspire.Hosting 13.4.6's `ASPIREMCP001` diagnostic — it is marked
`[Experimental]` and is subject to change or removal in a future Aspire release. `AddWorkspecMcp`
suppresses it with a narrowly-scoped `#pragma warning disable ASPIREMCP001` around the single call
site (`aspire-hosting-mcp/WorkspecMcpExtensions.cs`), not around the whole resource-registration
chain — the diagnostic's reported location spans the entire invocation-expression tree it's called
on, so calling it as a standalone statement (`resourceBuilder = resourceBuilder.WithMcpServer(...)`)
rather than mid-chain keeps the suppressed region to that one line.

## Health-check semantics

`AddWorkspecMcp` wires `WithWorkspecHealthCheck("http", "/health")` — an HTTP liveness probe against
`GET /health`, which returns `200 {ok:true, dir}` once the aggregate server is listening. This is
the same shape as every other module's own liveness check, just at `/health` rather than the
per-module `/api/health` path (`packages/mcp-host/src/http-app.ts`'s health route is deliberately
unauthenticated and side-effect-free — it never touches the MCP transport itself).

## ATS codegen status

`AddWorkspecMcp` and `WorkspecMcpResource` are annotated with `[AspireExport]` per the same
["Multi-language integrations"](https://aspire.dev/extensibility/multi-language-integration-authoring/)
convention every other module integration in this repo follows, gated by the repo-wide
`EnableAspireIntegrationAnalyzers` setting in `aspire-hosting/Directory.Build.props`. As with the
other three packages (see [`c4-integration.md`](./c4-integration.md)'s "ATS codegen status" section
for the full NU1605/CLI-version-mismatch story), a clean `dotnet build` with zero `ASPIREEXPORTxxx`
diagnostics is the primary, CI-enforced evidence the exports are well-formed; generating and
exercising the actual TypeScript SDK shape for this package has not been separately validated in
this environment.

## Internal implementation note

Unlike `aspire-hosting-decisions`/`aspire-hosting-c4`/`aspire-hosting-cost`, this package has no
dashboard commands, so it does not consume `Aspire.Hosting.Workspec.WorkspecCliRunner` — the only
CLI invocation it drives is the long-running `--http` process itself, started and supervised by
Aspire's own `ExecutableResource` machinery, the same as `WorkspecC4StudioResource`/
`WorkspecDecisionsStudioResource`.

## See also

- [`decisions-integration.md`](./decisions-integration.md) / [`c4-integration.md`](./c4-integration.md)
  — the sibling module integrations this package's resource shape (`ExecutableResource`, HTTP
  endpoint, health check, CLI resolution via `WorkspecCliLocator`) is copied from.
- `packages/mcp-host` — the `workspec-mcp` CLI and aggregate MCP server this package wraps.
