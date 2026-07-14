# Example — Aspire AppHost (workspec-c4)

A worked TypeScript Aspire AppHost demonstrating the `workspec-c4` hosting integration shipped in
[`aspire-hosting/aspire-hosting-c4`](../../aspire-hosting/aspire-hosting-c4/). See
[`docs/aspire-hosting/c4-integration.md`](../../docs/aspire-hosting/c4-integration.md) for the full
walkthrough (quickstart, drift-gate flow, health-check semantics, command reference).

## Files

| File                 | Purpose                                                                             |
| -------------------- | ------------------------------------------------------------------------------------ |
| [`apphost.mts`](./apphost.mts)         | The AppHost entry point — adds the C4 studio resource, graph sync, and health check |
| [`aspire.config.json`](./aspire.config.json) | Points the AppHost at a local `.csproj` reference to `aspire-hosting-c4` (not a published NuGet version — see "Project references for local development" in Aspire's own docs) |

## Status: not wired into CI

This example is illustrative, not executed by this repo's CI (`.github/workflows/ci.yml`) in this
slice — that's deferred to A6. Running it for real requires:

- Aspire CLI >= 13.4 — with CLI 13.3.0, `aspire restore` fails with `NU1605: Detected package
  downgrade: Aspire.Hosting from 13.4.6 to 13.3.0` (the CLI's own internal codegen-scanning project
  pins `Aspire.Hosting` to the CLI's own version, conflicting with this package's `>= 13.4.6`
  reference). See the comment at the top of `apphost.mts` for the full verbatim error and
  `docs/aspire-hosting/c4-integration.md`'s "ATS codegen status" section for more.
- `aspire restore` (or `aspire run`) from this directory, which regenerates the gitignored
  `.aspire/modules/` TypeScript SDK that `apphost.mts` imports from.

The generated method shapes in `apphost.mts` (positional vs. options-object arguments) are written
from the C# signatures in `aspire-hosting-c4` and the ATS docs' own conventions, not validated
against a real generated `.d.ts` — see the file's own header comment.
