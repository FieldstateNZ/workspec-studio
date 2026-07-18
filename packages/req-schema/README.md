# @workspec/req-schema

The Zod **source of truth** for WorkSpec Traceability Workbench requirement artifacts —
SysReq/Gherkin and feature kinds. Mirrors `@workspec/cost-schema`'s shape: one Zod definition
yields TypeScript types (`z.infer`), runtime validation (`safeParse`), and generated JSON Schema.

## Status: T0 bootstrap skeleton

This package currently exports only its own identity constant. No schemas are defined yet — the
SysReq/Gherkin and feature artifact kinds land in **T1** (see
[`docs/traceability/spec.md`](../../docs/traceability/spec.md) §7/§8 for the module's package
sequence and build order).

## Dependency direction

`req-schema` has zero `@workspec` dependencies. Every other `@workspec/trace-*` package will
depend on it, directly or transitively — never the reverse — once T1 lands.

## Scripts

| Script                                        | Does                            |
| ---------------------------------------------- | -------------------------------- |
| `pnpm --filter @workspec/req-schema build`     | tsc + tsup → `dist/` (ESM + `.d.ts`) |
| `pnpm --filter @workspec/req-schema typecheck` | `tsc --noEmit`                   |
| `pnpm --filter @workspec/req-schema test`      | vitest                           |
