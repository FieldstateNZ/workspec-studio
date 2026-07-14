# aspire-hosting docs

Reference docs for the `.NET` Aspire hosting integrations under
[`aspire-hosting/`](../../aspire-hosting/) — see that directory's own
[README](../../aspire-hosting/README.md) for the package layout, naming conventions, NuGet
PackageIds, and toolchain. This directory holds the normative specs each package's own
`docs/aspire-hosting/*.md` file is the authoritative source for (linked from
`aspire-hosting/README.md` and each package's XML doc comments):

| Doc                                                        | Covers                                                                                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| [`graph-contract.md`](./graph-contract.md)                 | `workspec-graph/v1` — the JSON document `Aspire.Hosting.Workspec.Core`'s `WorkspecGraphDumper` produces from an apphost's `DistributedApplicationModel`. |
| [`import-mapping.md`](./import-mapping.md)                  | How `workspec-c4 import-aspire` (`packages/c4-studio`) projects a `workspec-graph/v1` document into a `.workspec/` C4 tree — classification rules, slugs, edge resolution, drift codes. |
| [`c4-integration.md`](./c4-integration.md)                  | `Aspire.Hosting.Workspec.C4` — the `workspec-c4` studio resource, the graph-sync drift gate (`WithGraphSync`), health checks, command reference. |
| [`decisions-integration.md`](./decisions-integration.md)    | `Aspire.Hosting.Workspec.Decisions` — the `workspec-decisions` studio resource, `WithDecision` linking, command reference.    |
| [`cost-integration.md`](./cost-integration.md)              | `Aspire.Hosting.Workspec.Cost` — Stocktake/Report/Validate commands, the publish-time Azure cost-estimate step, SKU-extraction caveats. |

## Reading order

New to this area? `graph-contract.md` → `import-mapping.md` → `c4-integration.md` covers the full
graph→C4 projection story end to end (the product this module family exists for — see
`aspire-hosting/README.md`'s opening paragraph). `decisions-integration.md`/`cost-integration.md`
are independent of that pipeline (Decisions has no apphost-graph-sync equivalent; Cost's own
publish-time estimate step reads the app model directly, not through `workspec-graph/v1`) and can
be read on their own.

## Status (A6, [#39](https://github.com/FieldstateNZ/workspec-studio/issues/39))

All four `aspire-hosting-*` packages (Core, C4, Decisions, Cost) are complete, tested, and shipped
in this repo as NuGet packages (`Workspec.Aspire.Hosting.*` — see `aspire-hosting/README.md`'s
"NuGet publishing" section). The shared CLI-runner/diagnostics/Markdown-formatting plumbing that
C4/Decisions/Cost each carried as a private per-module copy through A5 is now consolidated once in
`Aspire.Hosting.Workspec.Core` (`WorkspecCliRunner`/`WorkspecCliDiagnostic`) — each integration
doc's own "Internal implementation note" section points here. Release wiring
(`.github/workflows/release.yml`) is inert-but-ready pending a one-time manual nuget.org Trusted
Publishing setup — see [`docs/decisions/RELEASING.md`](../decisions/RELEASING.md).
