# WorkSpec Studio

The open-source **WorkSpec workbench family** — one monorepo holding every free WorkSpec
product, publishing packages that WorkSpec Enterprise consumes directly rather than
duplicating. Every package here is Enterprise-grade by constitution: Enterprise is a future
consumer of this code.

| Module      | Status      | Where                                              |
| ----------- | ----------- | -------------------------------------------------- |
| Decisions   | live        | `packages/decision-*`, `apps/site`, `apps/mf-host` |
| C4 Diagrams | in progress | `packages/c4-*`                                    |

## Layout

```
packages/   published @workspec/* libraries
apps/       the Studio site and smoke hosts
examples/   runnable example trees and demos
docs/       specs and design bundles
```

## Development

```bash
pnpm install
pnpm run lint        # eslint over the workspace
pnpm run typecheck   # per-package tsc (pnpm -r recursion)
pnpm run test        # per-package vitest (pnpm -r recursion)
pnpm run build       # per-package builds (--if-present)
```

CI runs the same four stages in order on every push and pull request.

## Decisions module

Costed architecture decisions as reviewable `*.decision.yaml` / `*.catalog.yaml` artifacts —
imported with full git history from
[`FieldstateNZ/workspec-decision-studio`](https://github.com/FieldstateNZ/workspec-decision-studio).

| Package                     | Path                       | Role                                                                      |
| --------------------------- | -------------------------- | ------------------------------------------------------------------------- |
| `@workspec/decision-schema` | `packages/decision-schema` | Zod source of truth → TS types, runtime validation, JSON Schema           |
| `@workspec/decision-engine` | `packages/decision-engine` | Pure, normative cost engine (no IO, no DOM)                               |
| `@workspec/decision-ui`     | `packages/decision-ui`     | Host-agnostic React views (standalone + module-federation remote)         |
| `@workspec/decision-studio` | `packages/decision-studio` | Standalone CLI + localhost host shell (`validate`, `render-adr`, `serve`) |

`apps/site` is the product site + in-browser demo (consumes the published npm packages).
`apps/mf-host` is the module-federation smoke host (CI integration proof, never published).
`examples/` holds the worked example decision/catalog trees. Docs — the schema spec, the tech
design, and the project's own dogfooded decision records (D1–D6) — live under
[`docs/decisions/`](docs/decisions).

Publishing is currently paused: the npm trusted publishers for the four `@workspec/decision-*`
packages need re-registering against this repo before
[`release.yml`](.github/workflows/release.yml) can publish (see the note at the top of that file).

## License

[Apache-2.0](LICENSE)
