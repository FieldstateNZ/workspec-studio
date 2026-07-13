// @workspec/cost-engine — C0 bootstrap.
//
// Depends on cost-provider + cost-schema. This is meant to be the pure,
// normative cost attribution engine (no IO, no DOM, no React) — the actual
// attribution logic lands in a later slice; for now this package exports only
// its own identity, so downstream packages have something real to wire
// against and typecheck.
export const COST_ENGINE_PACKAGE = '@workspec/cost-engine' as const;
