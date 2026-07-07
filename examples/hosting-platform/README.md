# Example — Hosting platform

Worked example for WorkSpec Decision Studio: **hosting platform for the data and
delivery services**, comparing AKS / App Service / Isolated App Service (ASE) /
Azure Container Apps across dev / test / prod.

## Artifacts

| File                                                                 | Artifact                                         |
| -------------------------------------------------------------------- | ------------------------------------------------ |
| [`platform.catalog.yaml`](./platform.catalog.yaml)                   | Catalog — pricing modes, schedules, SKUs         |
| [`hosting-platform.decision.yaml`](./hosting-platform.decision.yaml) | Decision — four costed options, criteria, levers |

These are the **golden fixture** ported from the design prototype's `engine.js`. They validate
against `@workspec/decision-schema` and become the cross-implementation conformance artifact the
engine (S2) and CLI (S3) snapshot-test against — the numbers must not drift.

At the default lever state (dev/test/prod, before any manual lever toggle) the engine (S2) is
expected to produce:

| Option               |    dev |   test |    prod | monthly |   annual | complete  |
| -------------------- | -----: | -----: | ------: | ------: | -------: | :-------: |
| AKS                  |    792 |    867 | 2869.05 | 4528.05 | 54336.58 |     ✓     |
| App Service          | 187.20 | 440.20 |  714.60 |    1342 |    16104 |     ✓     |
| ASE                  |      — |   1575 |    2900 |    4475 |    53700 |     ✓     |
| Azure Container Apps |    185 |    220 |     775 |    1180 |    14160 | modelling |

(AKS default levers: `scheduleNonProd` + `spotBatch` on, `reserveProd` off. App Service /
ACA: `scheduleNonProd` on. ASE: none.)
