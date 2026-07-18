# @workspec/trace-studio

The `workspec-trace` CLI, plus (later) a standalone localhost host shell for the WorkSpec
Traceability Workbench. Mirrors `@workspec/cost-studio`'s shape: a thin, testable `run(argv, io)`
core, with `bin.ts` as the only file that touches `process` directly.

## Status: T0 bootstrap skeleton

`workspec-trace` currently has no commands — running it just prints usage and exits `0`. Real
verbs (`emit`/`ingest`/`verify`) land in **T4** ("shippable value with zero frontend"); the
localhost host shell (`/traceability`) lands in **T8** (see
[`docs/traceability/spec.md`](../../docs/traceability/spec.md) §7/§8 for the full build sequence).

## Usage

```sh
npx workspec-trace
```

```
workspec-trace — WorkSpec Traceability Workbench CLI

Usage: workspec-trace <command> [options]

No commands are implemented yet — this is a bootstrap skeleton (T0).
See docs/traceability/spec.md §8 for the build sequence.
```

## Scripts

| Script                                         | Does                                 |
| ------------------------------------------------ | ------------------------------------- |
| `pnpm --filter @workspec/trace-studio build`     | tsc + tsup → `dist/` (ESM + `.d.ts`), incl. the `workspec-trace` executable |
| `pnpm --filter @workspec/trace-studio typecheck` | `tsc --noEmit`                       |
| `pnpm --filter @workspec/trace-studio test`      | vitest                                |
