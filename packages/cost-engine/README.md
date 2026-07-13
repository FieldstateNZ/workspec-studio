# @workspec/cost-engine

The pure, normative cost attribution engine for WorkSpec Cost Attribution. No IO, no DOM, no React
— it turns provider-sourced usage and pricing data into per-resource, per-owner attributed costs.

Status: C0 bootstrap — this package currently exports only its own package identity
(`COST_ENGINE_PACKAGE`) plus its dependencies on `@workspec/cost-provider` and
`@workspec/cost-schema`. The real attribution logic lands in a later slice.

Part of the Cost Attribution module (in progress — see issues C0–C7).

## Dependency direction

`cost-engine` depends on `cost-provider` and `cost-schema`.
