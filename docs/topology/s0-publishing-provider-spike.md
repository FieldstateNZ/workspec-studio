# S0 — Publishing-provider spike: findings

**Date:** 26 July 2026 · **Issue:** #103 · **Epic:** #112 · **Decision artifact:** `.workspec/decisions/aspire-publishing-strategy.yaml`
**Verdict: both gates pass — the enrichment branch (per the decision procedure recorded in #103/#112) is GO.** No expressibility gap surfaced, so gap generation (the conditional A2 follow-on) stays dormant.

## Versions pinned (all claims below are against exactly these)

.NET SDK 10.0.101 · Aspire CLI 13.4.6+87fe259e · `Aspire.Hosting`/`.AppHost`/`.Docker`/`.Azure`/`.Azure.Storage` all 13.4.6 · `Azure.Provisioning` 1.5.0 (`.Storage` 1.1.2, `.KeyVault` 1.1.0, `.Network` 1.1.0) · node 22.23.1 · tsx 4.23.1. v13.4.6 shipped 2026-06-20; point releases run ~weekly. The publish surface is the experimental `Aspire.Hosting.Pipelines` DAG (`ASPIREPIPELINES001–004`); the docs-described `PublishingCallbackAnnotation`/`PublishingContext` **does not exist** in this version (re-confirmed against tagged source).

## The five questions

**Q1 — What does a provider receive?** The live, mutable `DistributedApplicationModel` (full app graph), via `PipelineStepContext.Model`, plus DI services, execution context, logger. Not a manifest snapshot, not per-resource callbacks. Steps form a named DAG (`dependsOn`/`requiredBy`) executed topologically, concurrently where independent.

**Q2 — Can WorkSpec interpose and mutate in flight? YES — proven cross-package.** A pipeline step registered from a separate WorkSpec-owned assembly, ordered `dependsOn: validate-compute-environments, requiredBy: prepare-deployment-targets-{env}`, mutated the model and the **stock Docker Compose emitter reflected every early-window mutation** in its emitted YAML (injected env var, changed image tag, injected whole new resource emitted as its own service). Ordering behaved exactly as declared. Reproduced **end-to-end from a TypeScript apphost** as well.

**Q3 — Do injected concepts survive the stock provider? YES — all three probes, at step time**, through the stock Azure emitter (verified by baseline-vs-mutated `diff` of emitted Bicep):
- **SKU**: `Standard_GRS → Premium_LRS`, `Hot → Cool` landed (the Azure publishing context regenerates each module via `GetBicepTemplateFile()` at publish time, re-running accumulated `ConfigureInfrastructure` delegates).
- **Resource group**: per-resource steering via the public settable `AzureBicepResource.Scope` — emitted `scope: resourceGroup('rg-workspec-injected')`. Env-wide RG exists at builder time (`AddAzureEnvironment().WithResourceGroup(...)`).
- **Alien construct**: a vnet+subnet the stock provider doesn't model emitted cleanly both inside an existing module *and* as a new `AzureProvisioningResource` with its own `.bicep` + correctly wired `module` block in `main.bicep`.

**Q4 — Per-env fan-out? YES, two ways.** `aspire publish --environment dev|prod` propagates to `builder.Environment.EnvironmentName`; apphost branching produced divergent outputs (values *and* resource presence). Separately, two compute environments in one apphost emit **in one publish run, in parallel**, into `{outputPath}/{envName}/`, honoring `.WithComputeEnvironment(...)` bindings. Publish is stateless (no deployment-state writes) and repeatable.

**Q5 — Where does `WithWorkspecEnv()` attach?** Resource-builder extension + custom `IResourceAnnotation`, attached at builder time, read back inside publish-mode steps via `TryGetLastAnnotation`. Round-trip proven in publish mode. The pipeline hook itself (`withPipelineStepFactory`) is `[AspireExport]`ed — callable from TS by name.

**TS parity (risk 1 substantially retired):** a TS apphost is a guest over the same C# host runtime (JSON-RPC guest/host split — confirmed in Aspire source and docs by the research pass), and one end-to-end TS probe published a TS-registered pipeline step whose mutation landed in stock emitter output. Since the enrichment logic lives in the C# package, the architecture carries over; the one piece S0 did *not* prove is a third-party package's `[AspireExport]` surface regenerating under a *consumer* TS apphost — that lands in A1's acceptance. Separately, the CLI 13.3.0→13.4.6 upgrade fixed the previously-documented ATS codegen blocker (`aspire restore` now succeeds against the repo's own `[AspireExport]` surface; generated `.aspire/modules/aspire.mts` includes the full pipeline surface and all four workspec exports).

## The timing model (load-bearing for A1's design)

Compose env vars are **snapshotted** at `prepare-deployment-targets-{env}`; image/customization annotations are read **live** at `publish-{env}`; new resources need the prep step to mint their `DeploymentTargetAnnotation`. **WorkSpec's enrichment step therefore lives in the EARLY window** (after `validate-compute-environments`, required by prep). The stable `BeforePublishEvent` fires *after* prep — late-window reach only — and is not a substitute.

## Hazards (each empirically hit, each with a verified mitigation)

1. **Provider step names don't exist in run mode** (`AddDockerComposeEnvironment` doesn't add its resource to the model under `IsRunMode`) — a `dependsOn`/`requiredBy` naming them **hard-crashes `aspire run` at startup**. Mitigation (verified): register WorkSpec steps only when `ExecutionContext.IsPublishMode`.
2. **Never `dependsOn` the provider's prep step** — it gets pulled into the publish DAG, runs twice, isn't idempotent, and the double-run corrupts publish (`Resource '…' has multiple compute environments - 'dev, dev'`).
3. **Steps can execute twice in one process** (`before-start` runs unconditionally at startup) — WorkSpec steps must be idempotent.
4. **The Azure environment's step name is dynamic** (`azure{sha256(project)[..5]}`) — discover it from the model via the `PipelineStepFactoryContext` factory overload; never hardcode.
5. **Per-resource RG re-scoping doesn't cascade** to dependent modules (the generated `storage_roles` module kept `scope: rg` while its target moved) — coherent group placement is WorkSpec's own job, which the topology model is well placed to do.
6. **TS steps can't generically walk-and-mutate** (generated `Resource` handles lack mutation methods) — irrelevant to the architecture since enrichment lives in the C# package, but rules out a TS-only implementation.
7. `IDistributedApplicationBuilder` isn't in DI at step time; builder-shaped APIs (`ConfigureInfrastructure`) are reachable via a ~20-line `IResourceBuilder<T>` shim — no reflection, no internals.

## Churn posture

The entire Pipelines namespace is `[Experimental]` (four diagnostics, added incrementally through 13.x; the research pass found no GA timeline on the public roadmap as of July 2026). Because consuming the surface requires explicit `#pragma` suppressions, upgrades that reshape it should break **loudly at compile time** rather than silently — an inference from the diagnostic mechanism, not an upgrade we performed. A1 must isolate all `PipelineStep*`/`WithPipelineStepFactory` usage behind a thin internal seam so a rename/reshape doesn't ripple into domain code. The legacy manifest path is stable-because-abandoned; do not build on it. No production-grade Terraform/OpenTofu publisher exists (nearest: a single-maintainer alpha, already ported to pipelines — useful precedent, not a dependency).

## Branch call

Per the frozen decision procedure (recorded verbatim in #103): **Q2 and Q3 substantially yes → enrichment branch.** Recorded in `.workspec/decisions/aspire-publishing-strategy.yaml`; #106 is scoped to A1 accordingly. Fallback (B1, OpenTofu-only) remains documented in #106 and is well-precedented (a WorkSpec-owned `IComputeEnvironmentResource` mirroring `DockerComposeEnvironmentResource`) should the experimental surface shift under us.

*Full experimental evidence (raw facts, key emitted-output quotes, exact versions) is preserved as the evidence-record comment on issue #103; raw probe workspaces were scratch and are not retained.*
