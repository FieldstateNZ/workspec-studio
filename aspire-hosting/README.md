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
aspire-hosting-core/           Aspire.Hosting.Workspec.Core — class library (graph-dump contract,
                               CLI locator, health-check wiring, and the shared WorkspecCliRunner/
                               WorkspecCliDiagnostic process-execution + Markdown-formatting
                               primitives every module integration below consumes)
aspire-hosting-c4/             Aspire.Hosting.Workspec.C4 — class library
aspire-hosting-cost/           Aspire.Hosting.Workspec.Cost — class library
aspire-hosting-decisions/      Aspire.Hosting.Workspec.Decisions — class library
aspire-hosting-tests/          Aspire.Hosting.Workspec.Tests — xunit test project
aspire-hosting-e2e-fixture-apphost/
                               E2EFixtureAppHost — minimal real AppHost entry point
                               (Aspire.AppHost.Sdk + DCP wiring) that the tests'
                               DistributedApplicationTestingBuilder requires; no integration code
```

## Packages

All four are shipped in this repo (A6, [#39](https://github.com/FieldstateNZ/workspec-studio/issues/39)
closed out packaging/release wiring for every module integration built in A1–A5):

| Module    | Assembly                           | PackageId                          | Path                       | Docs                                                                                          | Tracking issue                                                    |
| --------- | ------------------------------------ | ------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Core      | `Aspire.Hosting.Workspec.Core`      | `Workspec.Aspire.Hosting.Core`      | `aspire-hosting-core`      | this README                                                                                   | [#34](https://github.com/FieldstateNZ/workspec-studio/issues/34)  |
| C4        | `Aspire.Hosting.Workspec.C4`        | `Workspec.Aspire.Hosting.C4`        | `aspire-hosting-c4`        | [`docs/aspire-hosting/c4-integration.md`](../docs/aspire-hosting/c4-integration.md)           | [#36](https://github.com/FieldstateNZ/workspec-studio/issues/36)  |
| Decisions | `Aspire.Hosting.Workspec.Decisions` | `Workspec.Aspire.Hosting.Decisions` | `aspire-hosting-decisions` | [`docs/aspire-hosting/decisions-integration.md`](../docs/aspire-hosting/decisions-integration.md) | [#37](https://github.com/FieldstateNZ/workspec-studio/issues/37)  |
| Cost      | `Aspire.Hosting.Workspec.Cost`      | `Workspec.Aspire.Hosting.Cost`      | `aspire-hosting-cost`      | [`docs/aspire-hosting/cost-integration.md`](../docs/aspire-hosting/cost-integration.md)       | [#38](https://github.com/FieldstateNZ/workspec-studio/issues/38)  |

[#35](https://github.com/FieldstateNZ/workspec-studio/issues/35) (A2) is a related TS-side
enabler (`workspec-c4 import-aspire` et al.) in `packages/`, not a fifth `aspire-hosting-*`
package.

## NuGet publishing

**PackageId naming (decided at A6):** the `Aspire.` PackageId prefix is **reserved** on
nuget.org — confirmed empirically by fetching `Aspire.Hosting`'s package page, which shows a
"Prefix Reserved" badge linking to nuget.org's
[ID Prefix Reservation](https://learn.microsoft.com/nuget/nuget-org/id-prefix-reservation) docs,
with owners `Microsoft` and `aspire`. That rules out publishing anything named `Aspire.*`, so
every package above ships as `Workspec.Aspire.Hosting.<Module>` instead, per the fallback this
README always documented — **assembly names are unaffected** and stay
`Aspire.Hosting.Workspec.*` (a PackageId and an assembly name are independent NuGet concepts; a
consumer's `<PackageReference Include="Workspec.Aspire.Hosting.C4" />` still resolves types under
the `Aspire.Hosting`/`Aspire.Hosting.Workspec` namespaces shown throughout this repo's docs).

Every package is versioned `0.1.0-alpha.0` (mirroring the `@workspec/*` npm packages' own alpha
convention — see `docs/decisions/RELEASING.md`), carries the `Apache-2.0`
`PackageLicenseExpression`, and embeds this README as its `PackageReadmeFile`. Release wiring
(`.github/workflows/release.yml`) is inert-but-ready pending a one-time manual nuget.org Trusted
Publishing setup — see `docs/decisions/RELEASING.md`'s "NuGet (.NET)" section for the exact
pending step.

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
