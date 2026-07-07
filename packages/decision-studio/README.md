# @workspec/decision-studio

The **standalone** WorkSpec Decision Studio: a CLI **and a localhost host shell**
for working with costed architecture decisions as YAML artifacts in your working
tree. No database, ever — `*.decision.yaml` / `*.catalog.yaml` files versioned by
git are the single source of truth.

This package ships the filesystem repository (`FsRepository`), the CLI, and the
Express host that mounts the `@workspec/decision-ui` Workspace view. The in-memory
test double (`MemoryRepository`) and the repository **port** live in
`@workspec/decision-schema`; the cost engine and the shared ADR renderer live in
`@workspec/decision-engine`.

## Quick start

```sh
# Serve the hosting-platform example on http://127.0.0.1:4173 and open it in a browser.
pnpm dev
```

`pnpm dev` builds the client and runs the host against `examples/hosting-platform`.
Pick a decision, watch per-env costs, toggle an optimisation lever and see the
model reprice — all backed by the YAML on disk.

## The host shell

The host is a thin Express server over `FsRepository` plus the built Vite client.
The browser talks to it through an **`HttpRepository`** that implements the same
six-method `DecisionRepositoryPort` the UI depends on:

```
browser (HttpRepository) → HTTP/JSON → Express → FsRepository → working tree
```

The client mounts the full four-view `<DecisionApp>` (Options / Compare / Catalog
/ ADR) inside `<DecisionStudioProvider>` with the inert link resolver and
`capabilities: { editCatalog: true, decide: true }` — so catalog editing and the
decide flow are live in the standalone host. Writes (decision **and** catalog) are
**Zod-validated** (reusing the schema) before they reach the repository; the
decide flow's `PUT /api/decision` and the Catalog editor's `PUT /api/catalog`
both round-trip to the `*.decision.yaml` / `*.catalog.yaml` on disk (comments
preserved).

### API routes

| Route                     | Does                                   |
| ------------------------- | -------------------------------------- |
| `GET /api/decisions`      | list decisions (`{ ref, id, title? }`) |
| `GET /api/decision?ref=…` | read + validate a decision             |
| `PUT /api/decision?ref=…` | Zod-validate + write a decision        |
| `GET /api/catalogs`       | list catalogs                          |
| `GET /api/catalog?ref=…`  | read + validate a catalog              |
| `PUT /api/catalog?ref=…`  | Zod-validate + write a catalog         |
| `GET /api/health`         | liveness + served directory            |

Refs are repo-root-relative POSIX paths; absolute or `..`-traversal refs are
refused.

## CLI

Installed as the `workspec-decisions` bin (single bin ⇒ `npx
@workspec/decision-studio …` runs it too):

```
workspec-decisions [command] [options]
```

### `serve [--dir <path>] [--port <n>] [--host <addr>]` — the DEFAULT command

Runs the localhost host shell over `--dir` (default: current directory) on
`--port` (default: 4173), bound to `--host` (default: `127.0.0.1`, localhost
only). With **no subcommand**, `serve` runs — `workspec-decisions` on its own
starts the host on the current directory.

```sh
npx @workspec/decision-studio serve --dir examples/hosting-platform
```

### `validate [--dir <path>]`

Discovers every `*.decision.yaml` and `*.catalog.yaml` under `--dir` (default:
current directory) by a recursive walk (skipping `node_modules`, `dist`, `.git`,
`coverage`), Zod-validates each, and for every decision checks its authored
SKU-line references against the catalog it points at.

- Prints CI-friendly `file:line:col: message` diagnostics.
- **Exits non-zero** if any artifact is invalid or has a dangling authored
  reference (unknown `sku` / `mode` / `schedule` on an option line).
- Dangling references **inside levers** (`set.mode`, `set.schedule`, or
  `addLines`) are reported as **warnings** (non-fatal): the engine falls back to
  PAYG / 24×7 for those, so a typo degrades rather than breaks.

```sh
# In CI, fail the build on any invalid decision or catalog:
npx @workspec/decision-studio validate --dir .
```

### `render-adr [--dir <path>] [--decision <ref|id>] [--out <file>]`

Loads a decision and its referenced catalog and renders a **deterministic**
Markdown ADR (context, considered options with computed per-env + annual costs,
the decision + rationale, consequences, and links) via the engine's shared ADR
renderer (`buildAdrModel` + `renderAdrMarkdown`). `--decision` selects by ref or
`metadata.id` when a directory holds more than one decision. Output goes to
`--out` or stdout.

> **The ADR is a generated artifact — never commit it.** The output is a pure
> transform of the YAML; regenerate it any time. The repo's `.gitignore` ignores
> `*.adr.md`, so writing `--out hosting.adr.md` keeps it out of version control.
> The same renderer drives S5's in-app ADR view, so the file and the app never
> diverge (porting decision **P8**: full, stable numbers; **P7**: no LLM
> authoring — the rationale is user-authored).

```sh
npx @workspec/decision-studio render-adr --dir examples/hosting-platform --out hosting.adr.md
```

## Programmatic API

```ts
import { FsRepository } from '@workspec/decision-studio';
import { compute, buildAdrModel, renderAdrMarkdown } from '@workspec/decision-engine';

const repo = new FsRepository('examples/hosting-platform');
const [{ ref }] = await repo.listDecisions();
const decision = await repo.readDecision(ref);
const catalog = await repo.readCatalog(repo.resolveCatalogRef(ref, decision));

compute(decision, catalog).cheapestId; // "appsvc"
renderAdrMarkdown(buildAdrModel(decision, catalog)); // Markdown ADR
```

### The repository port (six methods)

Every consumer of Decision Studio's UI depends on one small storage
abstraction, `DecisionRepositoryPort` (defined in `@workspec/decision-schema`).
It is deliberately minimal — **exactly six methods**, no watch/subscribe, no
history, no concurrency control. That minimal surface is the standalone feature
ceiling by design (git already provides versioning and review):

| Method          | Signature                          |
| --------------- | ---------------------------------- |
| `listDecisions` | `() => Promise<DecisionRef[]>`     |
| `readDecision`  | `(ref) => Promise<Decision>`       |
| `writeDecision` | `(ref, decision) => Promise<void>` |
| `listCatalogs`  | `() => Promise<CatalogRef[]>`      |
| `readCatalog`   | `(ref) => Promise<Catalog>`        |
| `writeCatalog`  | `(ref, catalog) => Promise<void>`  |

A `ref` is an opaque string; a `DecisionRef` / `CatalogRef` is `{ ref, id, title? }`.

- **`FsRepository`** (this package) implements the port over the filesystem.
  Refs are repo-root-relative POSIX paths. Reads parse + Zod-validate (throwing
  `ArtifactValidationError` with located issues on failure); writes Zod-validate
  first, then serialize with the `# yaml-language-server: $schema=…` directive
  header and **preserved comments** — the existing file is parsed with the `yaml`
  `Document` API and new values are patched into it in place, so authored
  comments and node styles survive a write.
- **`MemoryRepository`** (in `@workspec/decision-schema`, via
  `createMemoryRepository({ decisions?, catalogs? })`) is the factory-built
  in-memory double UI component tests run against.

## Scripts

| Script                                              | Does                                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------------------- |
| `pnpm dev` (repo root) / `… studio dev`             | build the client + serve `examples/hosting-platform` on http://127.0.0.1:4173   |
| `pnpm --filter @workspec/decision-studio build`     | tsup → server/CLI (`dist/index.js`, `dist/bin.js`) **and** Vite → `dist/client` |
| `pnpm --filter @workspec/decision-studio typecheck` | `tsc --noEmit` (server, CLI, and browser client)                                |
| `pnpm --filter @workspec/decision-studio test`      | vitest (repository round-trip, discovery, CLI, host API via supertest)          |

The build keeps the two targets separate: **tsup** compiles the Node server + CLI
(ESM, with a shebang on `bin.js`), **Vite** bundles the browser client into
`dist/client`, which the server serves.
