# Example — Aspire AppHost (workspec-c4, workspec-mcp)

A worked TypeScript Aspire AppHost demonstrating the `workspec-c4` hosting integration shipped in
[`aspire-hosting/aspire-hosting-c4`](../../aspire-hosting/aspire-hosting-c4/) and the aggregate
`workspec-mcp` hosting integration shipped in
[`aspire-hosting/aspire-hosting-mcp`](../../aspire-hosting/aspire-hosting-mcp/). See
[`docs/aspire-hosting/c4-integration.md`](../../docs/aspire-hosting/c4-integration.md) and
[`docs/aspire-hosting/mcp-integration.md`](../../docs/aspire-hosting/mcp-integration.md) for the
full walkthroughs (quickstart, drift-gate flow, health-check semantics, command reference).

## Files

| File                 | Purpose                                                                             |
| -------------------- | ------------------------------------------------------------------------------------ |
| [`apphost.mts`](./apphost.mts)         | The AppHost entry point — adds the C4 studio resource (graph sync, health check) and the aggregate MCP resource |
| [`aspire.config.json`](./aspire.config.json) | Points the AppHost at local `.csproj` references to `aspire-hosting-c4` and `aspire-hosting-mcp` (not published NuGet versions — see "Project references for local development" in Aspire's own docs) |

## Status: not wired into CI

This example is illustrative, not executed by this repo's CI (`.github/workflows/ci.yml`). It
remains blocked on the same Aspire CLI version mismatch through A6
([#39](https://github.com/FieldstateNZ/workspec-studio/issues/39)) — re-checked at A6 time
(`aspire --version` still reports `13.3.0` in this environment, unchanged since A3) and left
as-is, per A6's scope: no system-wide CLI install/upgrade was attempted. Running it for real
requires:

- **Aspire CLI >= 13.4** — with CLI 13.3.0, `aspire restore` fails with `NU1605: Detected package
  downgrade: Aspire.Hosting from 13.4.6 to 13.3.0` (the CLI's own internal codegen-scanning project
  pins `Aspire.Hosting` to the CLI's own version, conflicting with this package's `>= 13.4.6`
  reference). See the comment at the top of `apphost.mts` for the full verbatim error and
  `docs/aspire-hosting/c4-integration.md`'s "ATS codegen status" section for more.
- **The unblock step, precisely:** run `aspire update` to realign the installed CLI to a version
  whose bundled `Aspire.Hosting` is `>= 13.4.6` (or install a fresh Aspire CLI `>= 13.4` directly),
  then `aspire restore` (or `aspire run`) from this directory, which regenerates the gitignored
  `.aspire/modules/` TypeScript SDK that `apphost.mts` imports from. Once that succeeds, diff the
  generated `.d.ts`/`.mjs` shapes against `apphost.mts`'s hand-written calls (see the next
  paragraph) and correct any mismatch — that's the remaining validation step, not a CLI-availability
  problem.

The generated method shapes in `apphost.mts` (positional vs. options-object arguments) are written
from the C# signatures in `aspire-hosting-c4` and the ATS docs' own conventions, not validated
against a real generated `.d.ts` — see the file's own header comment.
