// @workspec/cost-provider — C0 bootstrap.
//
// Depends on cost-schema only. The pluggable cost-data provider port (the
// contract a real backend — e.g. cost-provider-azure — implements) lands in a
// later slice; for now this package exports only its own identity, so
// downstream packages have something real to wire against and typecheck.
export const COST_PROVIDER_PACKAGE = '@workspec/cost-provider' as const;
