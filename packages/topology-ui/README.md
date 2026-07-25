# @workspec/topology-ui

Host-agnostic React components for the WorkSpec Topology Workbench — a standalone library and a
module-federation remote, built on [`@workspec/design`](https://github.com/FieldstateNZ/workspec-design)
tokens over [`@workspec/topology-model`](../topology-model) / [`@workspec/topology-schema`](../topology-schema).

This is the **authored-only v0 surface**: a header (title, environment + lens switchers, resource
counts), a canvas (boundary boxes, node cards, declared edges), and a side panel (resource list ⇄
node detail) over one environment's `ResolvedTopology` and a `LensTree`. Drift reconciliation and
cost overlays are typed extension-point seams only (see `src/overlays.ts`) — not implemented here.

## Usage

```tsx
import { createFsSource } from '@workspec/topology-model/fs';
import { createInertLinkResolver, TopologyStudioProvider, TopologyWorkbench } from '@workspec/topology-ui';
import '@workspec/topology-ui/styles.css';

const host = {
  source: createFsSource('/path/to/repo'),
  links: createInertLinkResolver(),
  capabilities: { editLayout: false },
};

<TopologyStudioProvider host={host} theme="dark">
  <TopologyWorkbench />
</TopologyStudioProvider>;
```

`TopologyWorkbench` owns its own env/lens/selection UI state; the underlying data is loaded and
resolved through the provider's host (`useTopologyModel`/`useResolvedTopology`/`useLensTree`, all
TanStack Query-keyed on the host's file source instance).

## Host contract

```ts
interface TopologyStudioHost {
  source: TopologyFileSource; // the same port loadTopologyModel reads through
  links: LinkResolver; // resolves a resource's `realizes` c4-container chips; inert by default
  capabilities: { editLayout: boolean }; // always false in this authored-only slice
}
```

Provide it to `TopologyStudioProvider`, which also owns (or accepts) a TanStack `QueryClient` and
renders the themed root (`.tp-root`, WorkSpec tokens applied inline — no document-level theme
attributes).

## Extension points (not implemented — seams only)

`TopologyWorkbench` accepts optional `driftBySlug?: Record<string, DriftClass>` and
`costBySlug?: Record<string, NodeCost>` props (see `src/overlays.ts`), threaded down to `NodeCard`.
Omitted, a card renders exactly as today; present, a colour-blind-safe shape badge (drift) or a
small pill (cost) layers on with no further refactor. These land for real in later increments
(reconciliation / cost).

## Build

- `pnpm build` — the standalone library (`tsc --emitDeclarationOnly` + `tsup` + a Tailwind CSS
  compile into `dist/styles.css`), mirroring `packages/c4-ui` and `packages/decision-ui`.
- `pnpm build:mf` — the module-federation remote (`vite.config.mf.ts`), exposing
  `./TopologyWorkbench` and `./provider`, with React + `@tanstack/react-query` as shared
  singletons and everything else (`@workspec/topology-model`, `@workspec/topology-schema`,
  `@workspec/design`) bundled in.

## Testing

`pnpm test` (Vitest + jsdom + React Testing Library). The main integration test renders the golden
"web-app" fixture (read straight from `@workspec/topology-schema`'s own fixture files, seeded
through `@workspec/topology-model`'s `createMemorySource`) in both lenses, exercises the
environment switch (Front Door present only in prod), and opens a node detail from both the canvas
and the resource list.
