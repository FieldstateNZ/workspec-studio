# @workspec/cost-ui

Host-agnostic React views for WorkSpec Cost Attribution (standalone lib; module-federation remote
to follow, mirroring `@workspec/decision-ui` / `@workspec/c4-ui`).

Status: C0 bootstrap — this package currently exports only its own package identity
(`COST_UI_PACKAGE`) plus its dependencies on `@workspec/cost-engine` and `@workspec/cost-schema`.
The host provider contract and real views land starting C5.

Part of the Cost Attribution module (in progress — see issues C0–C7).

## Dependency direction

`cost-ui` depends on `cost-engine`, `cost-schema`, and `@workspec/design` (external).
