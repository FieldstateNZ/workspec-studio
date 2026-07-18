// @workspec/req-schema — the Zod source of truth for WorkSpec Traceability
// Workbench requirement artifacts (SysReq/Gherkin + feature kinds).
//
// T0 bootstrap skeleton (see docs/traceability/spec.md §7/§8): no schemas
// yet. This package mirrors @workspec/cost-schema's shape — package.json
// build/test/typecheck/lint scripts, tsconfig.build.json's browser-safe
// dist, exports map, and publishConfig — so the SysReq/Gherkin schemas
// (T1) slot in without reshaping the package.

/**
 * This package's own identity. Every other `@workspec/trace-*` package will
 * depend on this one, directly or transitively — never the reverse — once
 * T1 lands the SysReq/Gherkin schemas (mirrors `@workspec/cost-schema`'s
 * convention).
 */
export const REQ_SCHEMA_PACKAGE = '@workspec/req-schema' as const;
