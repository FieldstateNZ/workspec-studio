// @workspec/cost-provider-azure — C0 bootstrap.
//
// Depends on cost-provider + cost-schema ONLY (an implementation of the
// provider port, not a consumer of the engine or UI). The real Azure Cost
// Management adapter lands in a later slice; for now this package exports
// only its own identity, so downstream packages have something real to wire
// against and typecheck.
export const COST_PROVIDER_AZURE_PACKAGE = '@workspec/cost-provider-azure' as const;
