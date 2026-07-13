# @workspec/cost-provider

The pluggable cost-data provider contract for WorkSpec Cost Attribution — the port that a real
backend (e.g. `@workspec/cost-provider-azure`) implements to feed usage and pricing data into the
engine, independent of any one cloud vendor's API shape.

Status: C0 bootstrap — this package currently exports only its own package identity
(`COST_PROVIDER_PACKAGE`) plus its dependency on `@workspec/cost-schema`. The provider port itself
lands in a later slice.

Part of the Cost Attribution module (in progress — see issues C0–C7).

## Dependency direction

`cost-provider` depends on `cost-schema` only.
