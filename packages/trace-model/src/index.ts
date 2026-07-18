// @workspec/trace-model — the pure, normative traceability engine for the
// WorkSpec Traceability Workbench.
//
// T0 bootstrap skeleton (see docs/traceability/spec.md §7/§8): no
// evidence-join or coverage/pass/unproven derivation logic yet — that lands
// in T2, once this package can depend on @workspec/req-schema for its input
// types. Mirrors @workspec/cost-engine's shape (pure function library, no
// IO, no DOM, no React).

/** This package's own identity (mirrors `@workspec/cost-engine`'s convention). */
export const TRACE_MODEL_PACKAGE = '@workspec/trace-model' as const;
