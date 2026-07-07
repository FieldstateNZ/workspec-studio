# WorkSpec Studio

The open-source **WorkSpec workbench family** — one monorepo holding every free WorkSpec
product, publishing packages that WorkSpec Enterprise consumes directly rather than
duplicating. Every package here is Enterprise-grade by constitution: Enterprise is a future
consumer of this code.

| Module      | Status                     | Where                              |
| ----------- | -------------------------- | ---------------------------------- |
| Decisions   | pending import (see below) | `packages/decision-*`, `apps/site` |
| C4 Diagrams | in progress                | `packages/c4-*`                    |

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
pnpm run typecheck   # tsc --build (project references)
pnpm run test        # vitest, all workspace projects
pnpm run build       # per-package builds (--if-present)
```

CI runs the same four stages in order on every push and pull request.

## Pending: Decision Studio import

The history-preserving subtree import of
[`FieldstateNZ/workspec-decision-studio`](https://github.com/FieldstateNZ/workspec-decision-studio)
is a separate, gated step (repo access + trusted-publisher re-registration). This scaffolding
deliberately leaves `packages/decision-*`, `apps/site`, and `apps/mf-host` unclaimed for it —
do not create packages under those names before the import lands.

## License

[Apache-2.0](LICENSE)
