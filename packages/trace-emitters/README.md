# @workspec/trace-emitters

Pure emit/ingest functions for the WorkSpec Traceability Workbench's test-framework emitters —
`cucumber` and `junit`. Each emitter is a named convention binding SysReq artifacts to a test
toolchain in both directions: `emit(sysreqs) → files` and `ingest(results) → evidence[]`, plus its
declared conventions. Mirrors `@workspec/cost-engine`'s shape: no IO, no DOM, no React.

## Status: T0 bootstrap skeleton

This package currently exports only its own identity constant. The `cucumber` emitter (emit +
ingest, round-trip conformance test) lands in **T3**; `junit` follows later (see
[`docs/traceability/spec.md`](../../docs/traceability/spec.md) §2/§7/§8).

## Scripts

| Script                                            | Does                            |
| --------------------------------------------------- | -------------------------------- |
| `pnpm --filter @workspec/trace-emitters build`     | tsc + tsup → `dist/` (ESM + `.d.ts`) |
| `pnpm --filter @workspec/trace-emitters typecheck` | `tsc --noEmit`                  |
| `pnpm --filter @workspec/trace-emitters test`      | vitest                           |
