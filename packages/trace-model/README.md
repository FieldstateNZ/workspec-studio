# @workspec/trace-model

The pure, normative traceability engine for the WorkSpec Traceability Workbench. Mirrors
`@workspec/cost-engine`'s shape: no IO, no DOM, no React — a library of pure functions over
`@workspec/req-schema` artifacts.

## Status: T0 bootstrap skeleton

This package currently exports only its own identity constant. The evidence join and
coverage/pass/unproven derivation land in **T2**, with golden fixtures (see
[`docs/traceability/spec.md`](../../docs/traceability/spec.md) §7/§8).

## Scripts

| Script                                        | Does                            |
| ---------------------------------------------- | -------------------------------- |
| `pnpm --filter @workspec/trace-model build`    | tsc + tsup → `dist/` (ESM + `.d.ts`) |
| `pnpm --filter @workspec/trace-model typecheck`| `tsc --noEmit`                  |
| `pnpm --filter @workspec/trace-model test`     | vitest                           |
