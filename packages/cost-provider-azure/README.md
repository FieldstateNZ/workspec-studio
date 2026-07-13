# @workspec/cost-provider-azure

An Azure Cost Management implementation of the `@workspec/cost-provider` contract — pulls usage
and pricing data from Azure so the Cost Attribution engine can attribute spend without any
Azure-specific code living outside this package.

Status: C0 bootstrap — this package currently exports only its own package identity
(`COST_PROVIDER_AZURE_PACKAGE`) plus its dependencies on `@workspec/cost-provider` and
`@workspec/cost-schema`. The real Azure adapter lands in a later slice.

Part of the Cost Attribution module (in progress — see issues C0–C7).

## Dependency direction

`cost-provider-azure` depends on `cost-provider` and `cost-schema` ONLY — never on `cost-engine`,
`cost-ui`, or `cost-studio`.
