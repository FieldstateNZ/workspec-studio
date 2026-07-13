// @workspec/cost-schema — C0 bootstrap.
//
// This is the base of the Cost Attribution module's dependency graph: zero
// @workspec dependencies, by design (every other cost-* package depends on
// this one, directly or transitively, never the other way round). The Zod
// schemas for pricing catalogs, usage records, and allocation rules land in a
// later slice — for now this package exports only its own identity, so
// downstream packages have something real to wire against and typecheck.
export const COST_SCHEMA_PACKAGE = '@workspec/cost-schema' as const;
