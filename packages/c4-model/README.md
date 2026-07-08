# @workspec/c4-model

Pure loader/resolver for a WorkSpec C4 working tree. Discovers `.workspec/` elements, diagrams, and
`.layout/` files through a small file-source port, parses and validates every one via
[`@workspec/c4-schema`](../c4-schema), resolves every diagram's node/edge references against the
tree — the `__system__` alias, preferred-type disambiguation, and the c4-context safety net mirror
WorkSpec Enterprise's `get-diagram.ts`, while c4-container *lens partitioning* is a deliberate
enhancement beyond Enterprise's single combined preference list (see
`src/resolution/preferred-type.ts`) — and returns one typed `C4Model`, alongside a best-effort
diagnostics array. Never throws: every failure mode degrades to a diagnostic, and the model is
always data-complete.

No DOM, no React, no IO assumptions — the root entry only knows about `MemorySource`. Node-only
code (`FsSource`, `node:fs/promises`) lives behind the `./fs` subpath export, so importing
`@workspec/c4-model` itself never pulls in a `node:` module.

## Usage

```ts
import { loadC4Model, createMemorySource } from '@workspec/c4-model';
import { createFsSource } from '@workspec/c4-model/fs';

// Server-side / CLI: read a real working tree from disk.
const model = await loadC4Model(createFsSource('/path/to/repo'));

// Browser demo: no filesystem at all.
const source = createMemorySource({
  '.workspec/system/main.yaml': 'title: My System\ndescription: ...\n',
});
const memoryModel = await loadC4Model(source);

for (const diagnostic of model.diagnostics) {
  console.warn(`${diagnostic.severity} ${diagnostic.code}: ${diagnostic.message} (${diagnostic.file})`);
}
```

## The `C4FileSource` port

```ts
interface C4FileSource {
  listFiles(dirPath: string): Promise<readonly string[]>; // non-recursive, repo-relative, [] if missing
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>; // unused by the read-only loader today
  exists(path: string): Promise<boolean>;
}
```

Every path is POSIX-relative to the repo root that *contains* `.workspec/` (e.g.
`.workspec/actors/architect.yaml`). Two implementations: `createMemorySource` (`Map`-backed,
seedable, the root entry) and `createFsSource` (`node:fs/promises`-backed, the `./fs` subpath).

## Diagram resolution semantics

- `__system__` resolves to the tree's `system/*.yaml` singleton slug. A diagram that uses the alias
  with no system file anywhere raises `no-system` (error).
- Bare (untyped) node slugs disambiguate via a kind-preference order per diagram type
  (`PREFERRED_TYPE_BY_DIAGRAM`, mirroring Enterprise's `get-diagram.ts` for `c4-context` and
  `c4-component`), falling back to `C4_REF_KINDS`' own declaration order for anything unlisted — a
  deterministic replacement for Enterprise's DB-row-insertion-order tie-break, which has no
  equivalent in a file tree. `c4-container` is lens-partitioned: the logical lens prefers `domain`
  first, the deployment lens prefers `container` first — the model exposes both resolutions
  (`lensViews.logical` / `lensViews.deployment`) rather than picking one.
- Typed refs (`{component: diagram-editor}`) resolve directly by kind + slug; a kind/slug pair that
  doesn't exist raises `dangling-ref`.
- The system node is materialized (`injected: true`, id = the real system slug) whenever it's
  needed but not authored: every `c4-context` diagram that never references the system (the safety
  net Enterprise's `get-diagram.ts` also applies), and — for ANY diagram type — a diagram whose
  edges reference `__system__` without a node entry for it, so edge endpoints always resolve to a
  node actually present in the view (see `inject-system-node.ts`).
- Edge endpoints must resolve to a node present in the diagram (`__system__` resolves to the
  view's `kind: 'system'` node, which injection guarantees whenever the tree has a system).
  Unresolved endpoints raise `dangling-edge-ref`. An edge `category` absent from both the built-in
  defaults and `spec.yaml`'s `connections` map raises `unknown-category` — the category itself is
  never rejected.
- `.layout/<slug>.yaml` files join their diagram by slug. A pinned node or edge-routing-hint key
  that matches nothing the diagram's own YAML named (as a node ref *or* an edge endpoint — see
  `authored-diagram-refs.ts`) raises `orphan-layout-node` / `orphan-layout-edge-hint`; a layout file
  whose slug names no diagram at all raises `orphan-layout-file`.
- `~/`-rooted `links` entries that don't resolve to a file in the tree raise `dangling-link`;
  `@workspace/`-rooted entries are never diagnosable standalone. A cycle among elements' `~/` links
  to one another raises `link-cycle`.

## Diagnostics

`DIAGNOSTIC_CODES` (exported) is the full, documented catalogue — see
`src/model/diagnostic-codes.ts`. Every diagnostic carries `file` and (derived from it) `slug`.
`line`/`col` are present for `parse-error` and the five location-tied codes (`dangling-ref`,
`dangling-edge-ref`, `duplicate-slug`, `orphan-layout-node`, `orphan-layout-edge-hint` — located
via `@workspec/c4-schema`'s `locateYamlPath`); the remaining codes are file-only by design (see the
carries-line table in that file's doc comment for the per-code rationale). Reference-shaped codes
(`dangling-ref`, `duplicate-slug`) additionally carry `refSlug`: the slug the offending reference
points at, distinct from `slug` which names the file carrying the reference.

## Scripts

| Script                                        | Does                                       |
| ---------------------------------------------- | ------------------------------------------- |
| `pnpm --filter @workspec/c4-model run build`   | `tsc --emitDeclarationOnly` + tsup → `dist/` |
| `pnpm --filter @workspec/c4-model run typecheck`| `tsc -b`                                    |
| `pnpm --filter @workspec/c4-model run test`    | vitest (unit, conformance, edge cases)      |
| `pnpm --filter @workspec/c4-model run lint`    | eslint                                      |

## Out of scope (see other slices)

- The ELK-based auto-layout engine that fills in unpinned `.layout/` positions — **S4**.
- React canvas components — **S5**.
