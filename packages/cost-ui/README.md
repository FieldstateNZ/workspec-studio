# @workspec/cost-ui

Host-agnostic React views for WorkSpec Cost Attribution (standalone lib; module-federation remote
to follow, mirroring `@workspec/decision-ui` / `@workspec/c4-ui`).

Status: C0 bootstrap — this package currently exports only its own package identity
(`COST_UI_PACKAGE`) plus its dependencies on `@workspec/cost-engine` and `@workspec/cost-schema`.
The host provider contract and real views land starting C5.

Part of the Cost Attribution module (in progress — see issues C0–C7).

## Dependency direction

`cost-ui` depends on `cost-engine`, `cost-schema`, and `@workspec/design` (external).

## Module federation

The package has **two build targets from one `src/`** — no component forks:

- **`build`** (tsup) → the standalone ESM **library** (`dist/`).
- **`build:mf`** (`@module-federation/vite`, `vite.config.mf.ts`) → a
  **module-federation remote** (`dist-mf/remoteEntry.js` + exposed chunks:
  `./CostInventory`, `./AttributionWorkbench`, `./CostReport`, `./TagPlanView`,
  `./provider`, `./reactProbe`), so an enterprise host can mount Cost
  Attribution at runtime without bundling it — the D5 seam, mirroring
  `@workspec/decision-ui` and `@workspec/c4-ui`.

For the exposed-module contract, required props, the shared-singleton
version-range policy, and a minimal mount example, see
[`docs/cost/mf-host-contract.md`](../../docs/cost/mf-host-contract.md).
`apps/mf-host` mounts the remote for the CI smoke proof (a single React
instance across all three federated module families).
