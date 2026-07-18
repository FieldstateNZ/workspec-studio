// @workspec/trace-emitters — pure emit/ingest functions for the WorkSpec
// Traceability Workbench's test-framework emitters.
//
// An emitter is a named convention binding SysReq artifacts to a test
// toolchain in both directions: `emit(sysreqs) → files` and
// `ingest(results) → evidence[]`, plus its declared conventions (see
// docs/traceability/spec.md §2/§7). This is the seam — adding a framework
// means adding an emitter and nothing else.
//
// T0 bootstrap skeleton: no emitters yet. The `cucumber` emitter (emit +
// ingest, round-trip conformance-checked) lands in T3; `junit` follows
// later. Mirrors @workspec/cost-engine's shape (pure function library, no
// IO, no DOM, no React).

/** This package's own identity (mirrors `@workspec/cost-engine`'s convention). */
export const TRACE_EMITTERS_PACKAGE = '@workspec/trace-emitters' as const;
