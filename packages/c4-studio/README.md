# @workspec/c4-studio

The **standalone** WorkSpec C4 Studio: a CLI **and a localhost host shell** for browsing,
validating, and rendering C4 architecture trees straight from a working directory's
`.workspec/` files. No database, ever — the YAML under `.workspec/` versioned by git is the
single source of truth.

This package ships the CLI (`workspec-c4`) and the Express host that mounts
`@workspec/c4-ui`'s `C4Explorer`. Loading and resolution live in `@workspec/c4-model`; layout
in `@workspec/c4-layout`; the interactive canvas, the deterministic SVG renderer, and the host
contract in `@workspec/c4-ui`.

## Quick start

```sh
npx @workspec/c4-studio validate --dir .        # non-zero on any error-severity diagnostic
npx @workspec/c4-studio render system-context   # writes ./system-context.svg
npx @workspec/c4-studio                          # serve the interactive explorer on :4174
```

## CLI

Installed as the `workspec-c4` bin:

```
workspec-c4 [command] [options]
```

### `validate [--dir <path>] [--json] [--strict]`

Loads the tree via `@workspec/c4-model`'s `loadC4Model`. Prints every diagnostic as
`file:line: [severity] code message (slug)` to stderr (line omitted for the diagnostic codes
that are inherently file-only, not tied to one YAML entry — see `DIAGNOSTIC_CODES`'s doc
comment in `@workspec/c4-model`). Exits `1` if any **error**-severity diagnostic is present;
warnings alone don't fail the run unless `--strict` is given. `--json` additionally prints the
diagnostics array to stdout, for machine consumption. An empty or missing `.workspec/`
directory is a clean, zero-diagnostic run — not an error.

### `render <diagram-slug> [--dir <path>] [--out <file>] [--theme light|dark]`

Loads the model, lays the named diagram out via `@workspec/c4-layout` (honouring any
`.layout/` pins), and renders it to a standalone SVG via `@workspec/c4-ui`'s `renderSvg`.
Deterministic: the same tree always produces byte-identical output. Writes to `--out`
(default `<diagram-slug>.svg`), or stdout with `--out -`. An unknown slug exits `1` and lists
the diagrams that do exist. A `c4-container` diagram (which resolves to a logical/deployment
lens pair, never a single view) always renders its **logical** lens — reach the deployment
lens through the interactive `serve` explorer's lens toggle.

### `import-aspire --graph <file> [--dir <path>] [--mode scaffold|check] [--json]`

Projects a `workspec-graph/v1` JSON resource graph (dumped by a .NET Aspire apphost) into a
`.workspec/` tree: each non-parameter resource becomes a container/database/queue/external-system
element (classified by `typeName`/`kind` — see
[`docs/aspire-hosting/import-mapping.md`](../../docs/aspire-hosting/import-mapping.md) for the full
table), every generated element is tagged `aspire-managed`, and the whole graph is laid out into
one generated `diagrams/aspire-container.yaml` (parent/child containment, which the producer
captures only in each resource's `parent` field, is synthesized into `contains` edges).
`--mode scaffold` (default) writes the tree and is idempotent — a second run against the same
graph changes nothing, and a hand-authored file occupying an element's path or the reserved
`aspire-container` diagram slug is never overwritten. `--mode check` writes nothing and reports drift
(`element-missing`, `element-orphaned`, `edge-missing`, `edge-orphaned`, `field-drift`) between the
graph and the tree, exiting `0` clean / `1` on drift / `2` on a usage error; `--json` prints the
diagnostics array to stdout in the same shape `validate --json` does.

### `serve [--dir <path>] [--port <n>] [--host <addr>]` — the DEFAULT command

Runs the localhost host shell over `--dir` (default: current directory) on `--port` (default
4174), bound to `--host` (default `127.0.0.1`, localhost only). With **no subcommand**,
`serve` runs. Mounts `C4Explorer` with `capabilities: { editLayout: true }`: browse diagrams,
drill down, and drag-to-pin writes the diagram's `.workspec/diagrams/.layout/<slug>.yaml`
back into the working tree.

```sh
npx @workspec/c4-studio serve --dir .
```

## The host shell

Unlike `@workspec/decision-studio`'s server (one route pair per artifact kind), the API here
proxies `@workspec/c4-model`'s own four-method `C4FileSource` port directly over HTTP, plus
one convenience endpoint that runs the loader server-side:

```
browser (HttpSource) → HTTP/JSON → Express → FsSource → working tree
```

| Route                         | Does                                                                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `GET /api/model`              | runs `loadC4Model` server-side, returns the whole model as JSON                                                        |
| `GET /api/files?dir=…`        | `C4FileSource.listFiles` — non-recursive directory listing                                                             |
| `GET /api/file?path=…`        | `C4FileSource.readFile`                                                                                                |
| `PUT /api/file?path=…`        | `C4FileSource.writeFile` — **only** for `.layout/` paths, Zod-validated (`parseLayoutYaml`) before it reaches the tree |
| `GET /api/file-exists?path=…` | `C4FileSource.exists`                                                                                                  |
| `GET /api/health`             | liveness + served directory                                                                                            |

Paths are repo-root-relative POSIX paths; absolute or `..`-traversal paths are refused, and
**every route — reads included — is confined to `.workspec/**`**: the explorer client only
ever requests `.workspec/` paths, so a path elsewhere in the served root (`.git/`, `.env`,
source files) is 400'd at the parameter gate, never served. Writes are further restricted:
the only write path any `@workspec/c4-ui` component ever exercises is the drag-to-pin
`.layout/` write (`C4Diagram`'s `writeLayout`), so `PUT /api/file` refuses every
non-`.layout/` path with 400, and Zod-validates the body against `Layout` before writing.

## Programmatic API

```ts
import { loadC4Model, createFsSource, renderDiagramToSvg } from '@workspec/c4-studio';

const model = await loadC4Model(createFsSource('/path/to/repo'));
const result = await renderDiagramToSvg(model, 'system-context', { theme: 'dark' });
if (result.ok) console.log(result.svg);
```

## Scripts

| Script                                        | Does                                                                                         |
| --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `pnpm --filter @workspec/c4-studio build`     | `tsc --emitDeclarationOnly` + tsup → `dist/index.js`/`dist/bin.js`, and Vite → `dist/client` |
| `pnpm --filter @workspec/c4-studio typecheck` | `tsc -b` (server, CLI, and browser client)                                                   |
| `pnpm --filter @workspec/c4-studio test`      | vitest (CLI, render determinism/golden, host API via supertest)                              |

The build keeps the two targets separate: **tsup** compiles the Node server + CLI (ESM, with a
shebang on `bin.js`), **Vite** bundles the browser client into `dist/client`, which the server
serves.
