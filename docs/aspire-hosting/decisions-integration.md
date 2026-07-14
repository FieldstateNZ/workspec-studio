# workspec-decisions Aspire hosting integration

`Aspire.Hosting.Workspec.Decisions` (`aspire-hosting/aspire-hosting-decisions`, slice A4,
[#37](https://github.com/FieldstateNZ/workspec-studio/issues/37)) wires the `workspec-decisions` CLI
(`packages/decision-studio`) into a .NET Aspire apphost: a dashboard resource that serves the
Decision Studio explorer over a directory of `*.decision.yaml`/`*.catalog.yaml` artifacts, a
`WithDecision` annotation that links any other resource to the decision record governing it, and
`Validate`/`Render ADR` dashboard commands.

Unlike aspire-hosting-c4's `.workspec/` tree, the directory this integration serves has **no
required substructure** — decision/catalog YAML files may live anywhere underneath it;
`workspec-decisions` scans recursively.

## Quickstart

```csharp
using Aspire.Hosting;

var builder = DistributedApplication.CreateBuilder(args);

var decisions = builder.AddWorkspecDecisions("decisions", "decisions");

var api = builder.AddProject<Projects.Api>("api")
    .WithDecision(decisions, "decisions/pick-database.decision.yaml");

builder.Build().Run();
```

This adds a `WorkspecDecisions` resource to the dashboard: an HTTP endpoint serving the Decision
Studio explorer (labeled "Decisions"), a liveness health check, and two dashboard commands
(`validate`, `render-adr`). `WithDecision` additionally draws a labeled "governed-by" relationship
edge from `api` to `decisions` in the dashboard's resource graph, and adds a dashboard URL on `api`
itself pointing into the explorer (see "Deep-link semantics" below for exactly what that URL does
and doesn't do).

`WithDecision` accepts any resource type — not just ones with endpoints. A configuration parameter,
a database, a queue: anything whose shape was chosen by a recorded decision can be annotated:

```csharp
var region = builder.AddParameter("region", "us-east-1")
    .WithDecision(decisions, "decisions/pick-region.decision.yaml");
```

## Deep-link semantics (and the limitation)

The URL `WithDecision` adds always points at the Decision Studio explorer's **root** — never at a
specific decision. This is a deliberate, honest choice, not an oversight:

- `packages/decision-studio/client/main.tsx` keeps the selected decision as local React component
  state (`useState`), seeded by auto-selecting the first entry returned from `GET /api/decisions`.
  It never reads a route segment or a `?ref=` query parameter to decide which decision to display.
- `packages/decision-studio/src/server.ts`'s Express host does accept a `?ref=` query string, but
  only on its JSON API (`GET /api/decision?ref=...`); its SPA-fallback route
  (`app.get(/^(?!\/api\/).*/, ...)`) serves the same `index.html` for **any** non-API GET,
  regardless of query string. A URL like `{decisionsUrl}/?ref=<ref>` would load successfully and
  silently ignore the ref — it would not 404, but it also would not select that decision.

Rather than construct a URL that implies a deep-linking capability the client doesn't have, the
added URL is always the explorer root; the decision ref appears only in the link's **display
text** (`"Decision: <ref>"`), so whoever clicks it knows which decision to pick once the explorer
loads and lists everything under the served directory. Revisit this once
`@workspec/decision-studio`'s client supports selecting a decision from the URL itself.

The URL is still built correctly with respect to *where* the explorer actually is: it embeds the
decisions resource's real allocated `"http"` endpoint (via an `EndpointReference` interpolated into
the URL string — the same `ReferenceExpression`-based mechanism `WithEnvironment`/`WithUrl` use
elsewhere in Aspire, resolved once endpoints are allocated), never a hardcoded port. Two apphost
runs on different ports get correctly different links.

## Command reference

Both commands appear in the dashboard's resource command menu and are also reachable via
`aspire resource <name> <command>` and the Aspire MCP server. Like aspire-hosting-c4's commands,
both run regardless of the resource's lifecycle state — they invoke the CLI directly against the
served directory on disk, independent of whether the `serve` process is up.

- **`validate`** — runs `workspec-decisions validate --json --dir <dir>`. Exit 0 (no errors) is a
  `Success` result with a Markdown diagnostics table (or a "no diagnostics" message if the array is
  empty); exit 1 (at least one error-severity diagnostic) is a `Failure` result carrying the same
  table. As with C4's `validate`: exit 1 is a normal, successful command execution reporting a
  failure *state*, not a thrown exception or crash. A CLI that couldn't be run at all, or whose
  `--json` output couldn't be parsed, produces a clean `Failure` message instead — never an
  unhandled-exception toast in the dashboard.

- **`render-adr`** — runs `workspec-decisions render-adr --dir <dir>` and resolves which decision
  to render in this order:
  1. **Exactly one decision under `<dir>`** — the CLI itself renders it without needing any
     `--decision` argument (mirroring `packages/decision-studio/src/cli.ts`'s own
     `decisions.length === 1` behavior), and the command reports success.
  2. **More than one decision, and at least one `WithDecision` ref has been registered against
     this decisions resource** — the command retries with `--decision <firstRegisteredRef>` (first
     in call order across every `WithDecision` call in the apphost). If that ref resolves to a real
     decision, it renders; if not (e.g. the ref doesn't match anything under `<dir>`), the command
     reports the CLI's own `"no decision matching"` failure.
  3. **More than one decision, and no `WithDecision` ref is registered** — the command fails,
     surfacing the real CLI's own ambiguity message verbatim (`"multiple decisions found; pass
     --decision <ref|id>:"` followed by every candidate's ref and id). No separate directory scan is
     invented — the CLI's own listing, produced as a side effect of the same discovery run, is the
     single source of truth for "what are my options."
  4. **Zero decisions under `<dir>`** — the command fails with the CLI's own `"no *.decision.yaml
     found"` message. No `WithDecision` ref, however many are registered, changes this outcome —
     there is nothing to render.

  This keeps the C# side simple: it never re-implements YAML scanning or ref validation itself,
  only orchestrates at most two real CLI invocations and reads their exit codes/stderr.

## ATS codegen status

This package's public surface (`AddWorkspecDecisions`, `WithDecision`, plus the
`WorkspecDecisionsStudioResource` type) is annotated with `[AspireExport]` per the same
["Multi-language integrations"](https://aspire.dev/extensibility/multi-language-integration-authoring/)
convention aspire-hosting-c4 follows, gated by the same repo-wide
`EnableAspireIntegrationAnalyzers` setting in `aspire-hosting/Directory.Build.props`. As with C4 (see
[`c4-integration.md`](./c4-integration.md)'s own "ATS codegen status" section for the full
NU1605/CLI-version-mismatch story), a clean `dotnet build` with zero `ASPIREEXPORTxxx` diagnostics
is the primary, CI-enforced evidence the exports are well-formed; generating and exercising the
actual TypeScript SDK shape for this package has not been separately validated in this environment.

## Internal implementation note

`WorkspecDecisionsCliRunner`/`WorkspecDecisionsCliDiagnostic` are private, internal copies of
aspire-hosting-c4's `WorkspecC4CliRunner`/`WorkspecCliDiagnostic` (process execution with a 60s
timeout and process-tree kill, `--json` diagnostics parsing, pipe-escaped Markdown table
formatting), adapted to the Decisions CLI's own diagnostic shape (no `slug` field, only optional
`line`/`col`). This duplication is deliberate for A4 rather than reaching into aspire-hosting-c4 or
aspire-hosting-core (both are out of scope for this slice); consolidating the identical runner logic
into Core is tracked by A6 ([#39](https://github.com/FieldstateNZ/workspec-studio/issues/39)).

## See also

- [`c4-integration.md`](./c4-integration.md) — the sibling C4 integration this package's patterns
  (resource shape, CLI runner, command conventions) are copied from.
- [`graph-contract.md`](./graph-contract.md) / [`import-mapping.md`](./import-mapping.md) — the
  workspec-graph/v1 contract, not consumed by this integration (Decisions has no apphost-graph-sync
  equivalent to C4's `WithGraphSync`).
