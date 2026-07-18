# @workspec/trace-ui

Host-agnostic React views for the WorkSpec Traceability Workbench — the four views (Requirements,
Feature detail, Matrix, Run review), composed on `@workspec/design`. No host framework or CSS
assumptions baked in (standalone lib + module-federation remote, mirroring `@workspec/cost-ui`'s
shape).

## Status: T0 bootstrap skeleton

This package currently exports only its own identity constant. No views, no `@workspec/design` or
React dependency, no compiled stylesheet, and no module-federation remote yet — those land
starting **T5** (Requirements + Feature detail), with the Matrix view/export and Run review
following in later slices (see [`docs/traceability/spec.md`](../../docs/traceability/spec.md)
§7/§8).

When the real views land, this package will pick up:

- `@workspec/design` + `react`/`react-dom` peer dependencies
- `dist/styles.css` (Tailwind, compiled via `@tailwindcss/cli`) and its `./styles.css` export
- `build:mf` (module-federation remote-entry via `vite.config.mf.ts`)

exactly as `@workspec/cost-ui` does today.

## Scripts

| Script                                     | Does                            |
| -------------------------------------------- | -------------------------------- |
| `pnpm --filter @workspec/trace-ui build`     | tsc + tsup → `dist/` (ESM + `.d.ts`) |
| `pnpm --filter @workspec/trace-ui typecheck` | `tsc --noEmit`                  |
| `pnpm --filter @workspec/trace-ui test`      | vitest                           |
