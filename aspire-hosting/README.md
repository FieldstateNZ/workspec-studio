# aspire-hosting

.NET Aspire hosting integrations for WorkSpec modules — the consumer's apphost graph
(services, resources, references) feeds each module, letting WorkSpec generate its
architecture/cost/decision artifacts from the real running topology instead of a
hand-maintained `.workspec/` tree.

This is the monorepo's first .NET area, sitting alongside the pnpm/TypeScript workspace at
the repo root. It has its own solution, build props, and CI stage; it does not participate
in the pnpm workspace.

## Naming conventions

| Concern           | Convention                    | Example                              |
| ------------------ | ------------------------------ | ------------------------------------- |
| Package directory | kebab-case, `aspire-hosting-*` | `aspire-hosting-core`                |
| Assembly / project | `Aspire.Hosting.Workspec.*`    | `Aspire.Hosting.Workspec.Core`       |
| Solution          | `Aspire.Hosting.Workspec.slnx` | (this directory's `.slnx`)           |

## Layout

```
Aspire.Hosting.Workspec.slnx   solution (new XML .slnx format)
Directory.Build.props          shared TFM/nullable/warnings-as-errors settings
Directory.Packages.props       central package version management
aspire-hosting-core/           Aspire.Hosting.Workspec.Core — class library
aspire-hosting-c4/             Aspire.Hosting.Workspec.C4 — class library
aspire-hosting-tests/          Aspire.Hosting.Workspec.Tests — xunit test project
aspire-hosting-e2e-fixture-apphost/
                               E2EFixtureAppHost — minimal real AppHost entry point
                               (Aspire.AppHost.Sdk + DCP wiring) that the tests'
                               DistributedApplicationTestingBuilder requires; no integration code
```

## Planned packages

| Module    | Assembly                           | Path                       | Slice | Tracking issue                                                    |
| --------- | ----------------------------------- | --------------------------- | ----- | ------------------------------------------------------------------ |
| Core      | `Aspire.Hosting.Workspec.Core`      | `aspire-hosting-core`      | A1 (scaffolded in A0) | [#34](https://github.com/FieldstateNZ/workspec-studio/issues/34)  |
| C4        | `Aspire.Hosting.Workspec.C4`        | `aspire-hosting-c4`        | A3 — see [`docs/aspire-hosting/c4-integration.md`](../docs/aspire-hosting/c4-integration.md) | [#36](https://github.com/FieldstateNZ/workspec-studio/issues/36)  |
| Decisions | `Aspire.Hosting.Workspec.Decisions` | `aspire-hosting-decisions` | A4    | [#37](https://github.com/FieldstateNZ/workspec-studio/issues/37)  |
| Cost      | `Aspire.Hosting.Workspec.Cost`      | `aspire-hosting-cost`      | A5    | [#38](https://github.com/FieldstateNZ/workspec-studio/issues/38)  |

This slice (A0, [#33](https://github.com/FieldstateNZ/workspec-studio/issues/33)) only
bootstraps the solution — Core's actual contents (graph-dump contract, CLI locator,
health plumbing) land in A1. [#35](https://github.com/FieldstateNZ/workspec-studio/issues/35)
(A2) is a related TS-side enabler (`workspec-c4 import-aspire` et al.) in `packages/`, not
a fifth `aspire-hosting-*` package.

## NuGet publishing

No package has a decided `PackageId` yet. That's deliberate: launch naming is
[#39](https://github.com/FieldstateNZ/workspec-studio/issues/39) (A6), pending a check
that the `Aspire.*` prefix is available to reserve on nuget.org (prefix reservation gates
who can publish `Aspire.*`-named packages at all; the fallback if it isn't is
`Workspec.Aspire.Hosting.*` PackageIds while assembly names stay
`Aspire.Hosting.Workspec.*`). Until #39 resolves, these are source-only, unpublished
projects — assembly names above are provisional.

## Aspire.Hosting.Integration.Analyzers

The standalone `Aspire.Hosting.Integration.Analyzers` NuGet package publishes
prerelease-only versions (each tracking a stable `Aspire.Hosting` release), so we don't
take it as a dependency. Instead the same analyzer assembly ships inside the
`Aspire.Hosting` package itself as a `buildTransitive` asset, gated behind the
`EnableAspireIntegrationAnalyzers` MSBuild property (false by default).
`Directory.Build.props` here sets it to `true` for every project in this directory.

## Toolchain

- .NET SDK: `net10.0` (see `Directory.Build.props`)
- Aspire packages: `13.4.6` (latest stable 13.x at time of writing — see
  `Directory.Packages.props`)
- Tests: xunit 2.9.3 + `xunit.runner.visualstudio` + `Microsoft.NET.Test.Sdk`, matching
  what the .NET 10 SDK's own `dotnet new xunit` / `dotnet new aspire-xunit` templates
  generate (classic xunit v2 + VSTest, not xunit.v3/Microsoft.Testing.Platform).

```bash
cd aspire-hosting
dotnet build Aspire.Hosting.Workspec.slnx --configuration Release
dotnet test Aspire.Hosting.Workspec.slnx --configuration Release --no-build
```
