# `@workspec/cost-ui` module-federation host contract

This is the contract for an **enterprise host** mounting the Cost Attribution
UI at runtime as a [module-federation](https://module-federation.io/) remote —
the D5 seam (`docs/decisions/d5-enterprise-mount-seam.decision.yaml`), the same
seam `@workspec/decision-ui` and `@workspec/c4-ui` already use. It is checked
against the code that implements it: `packages/cost-ui/vite.config.mf.ts`,
`packages/cost-ui/src/mf/*`, and the CI smoke host at `apps/mf-host` (see
`apps/mf-host/src/bootstrap.tsx` and `apps/mf-host/src/cost-seed.ts` for a
working example of everything below).

The package has **two build targets from one `src/`** — no component forks:

- `pnpm --filter @workspec/cost-ui build` (tsup) → the standalone ESM
  **library** (`dist/`), for a host that bundles the package at build time.
- `pnpm --filter @workspec/cost-ui build:mf` (`@module-federation/vite`) → a
  **module-federation remote** (`dist-mf/remoteEntry.js` + exposed chunks),
  for a host that mounts the UI at runtime without bundling it. This document
  covers that second target.

## Exposed modules

| Remote module               | Backed by                                            | What it is                                          |
| ---------------------------- | ----------------------------------------------------- | ---------------------------------------------------- |
| `costStudio/CostInventory`   | `CostInventory`                                       | The stock-take read view, cross-referenced against the current attribution. |
| `costStudio/AttributionWorkbench` | `AttributionWorkbench`                          | The 2a unified workbench: rule rail, resource table + cascade, coverage meter, triage/composer. |
| `costStudio/CostReport`      | `CostReport`                                          | Stat cards, spend-by-primary-dimension bars, and a primary × second-dimension cross-tab. |
| `costStudio/TagPlanView`     | `TagPlanView`                                         | The read-only render of a committed `*.tagplan.yaml`. |
| `costStudio/provider`        | `CostStudioProvider` + `createInertLinkResolver`      | The host wiring — see below.                        |
| `costStudio/reactProbe`      | —                                                     | A single-React-instance canary (used by the CI smoke test; not needed by a real host). |

The remote's federation name is `costStudio` (`vite.config.mf.ts`'s
`federation({ name: 'costStudio', … })`); a host declares it under that key in
its own `federation({ remotes: { costStudio: { … } } })` config, pointing
`entry` at wherever it serves the remote's `remoteEntry.js`.

**Mount the provider from the remote, not from a local copy.** A host that
imported `CostStudioProvider` from its own bundled `@workspec/cost-ui` would
create a *second* React context, and the remote's views' `useHost()` would
throw. Import `CostStudioProvider` and `createInertLinkResolver` from
`costStudio/provider` (the federated module), never from a separately
installed copy of the package, so the provider and the views share ONE module
instance — one `HostContext`, one `QueryClient` wiring — across the boundary.

## Required props per component

Every one of the four views is a self-contained container that reads its own
data through `CostStudioProvider`'s repository (TanStack Query, shared cache)
— there is no prop for inventory/attribution/spend data directly.

| Component               | Props                                                                                | Notes |
| ------------------------ | ------------------------------------------------------------------------------------- | ----- |
| `CostInventory`          | `{ inventoryRef: Ref; attributionRef: Ref }`                                          | Both refs required. |
| `AttributionWorkbench`   | `{ inventoryRef: Ref; attributionRef: Ref; state?: AttributionWorkbenchState; onStateChange?: (state) => void }` | `state`/`onStateChange` are optional — omit both for an uncontrolled workbench with its own internal state (the common case for a standalone mount). |
| `CostReport`             | `{ inventoryRef: Ref; attributionRef: Ref; disabledRuleIds?: string[]; onFixCoverage?: () => void }` | `disabledRuleIds` keeps this view "live" against whatever the workbench currently has toggled off, when both are mounted together and share lifted state. |
| `TagPlanView`            | `{ inventoryRef: Ref; tagPlanRef?: Ref }`                                             | `tagPlanRef` optional — omit to render the "no plan" empty state. |

`Ref` is `@workspec/cost-schema`'s opaque storage reference (a string) — an id
or path the host's `CostRepositoryPort` implementation understands.

Every component must be rendered inside a `CostStudioProvider` (from
`costStudio/provider`); calling any of them outside one throws
(`useHost must be used within a <CostStudioProvider>.`).

## The host object

```ts
interface CostStudioHost {
  /** Storage: the twelve-method port (list/read/write × inventory/spend/attribution/tagPlan). */
  repository: CostRepositoryPort; // from @workspec/cost-schema
  /** Turns cost links into hrefs/handlers. Defaults to an inert resolver (createInertLinkResolver()). */
  links?: CostLinkResolver;
  /** Optional host navigation for resolved link targets and cross-view jumps (e.g. Reports' "Fix in workbench →"). */
  navigate?: (target: CostLinkTarget) => void;
  /** What the current host permits. */
  capabilities: { editAttribution: boolean };
}
```

- **`repository`** — a `CostRepositoryPort` (`@workspec/cost-schema`): twelve
  methods, three per artifact kind (`listInventories`/`readInventory`/`writeInventory`,
  and the same trio for spend, attribution, and tag plan). The UI never
  assumes which implementation backs it. `createMemoryRepository(seed)` (also
  from `@workspec/cost-schema`) is the in-memory implementation the smoke host
  uses; a real enterprise host supplies a graph-backed one. Query hooks are
  keyed on the repository *instance* plus the artifact ref, so two
  repositories (or the same artifact read through two repository instances)
  never collide in cache.
- **`capabilities.editAttribution`** — the one feature gate. `true` unlocks
  the workbench's rail reorder/remove and the triage composer's "Add as
  rN" — all of which write through `repository.writeAttribution`. `false`
  renders everything read-only. There is no per-view override; it is a
  single flag on the host object.
- **`links`** / **`navigate`** — optional. Omit `links` for every cost link to
  render as an inert label (`createInertLinkResolver()` is the explicit
  no-op, and is also the default `useLinkResolver()` falls back to).

Provide the host object to `CostStudioProvider`, imported from the federated
`costStudio/provider` module (see above) — there is no other channel; the
views never read a global, `window`, or `matchMedia`.

## The `theme` prop — required, and never `matchMedia`

```ts
interface CostStudioProviderProps {
  host: CostStudioHost;
  queryClient?: QueryClient; // reuse the host's own; a private one is created when omitted
  theme?: 'dark' | 'light'; // defaults to 'dark' when omitted
  className?: string;
  children: ReactNode;
}
```

`theme` is a **plain prop**, not a default parameter to lean on. `CostStudioProvider`
and every component under it **never call `matchMedia` and never read
`localStorage`** — there is no ambient "detect the OS/browser preference"
fallback anywhere in this package. If a host wants the views to follow the
user's OS preference or its own theme switcher, it must read that itself and
thread the result down as `theme` on every re-render; this package will not
do it for the host, and will not silently pick a theme from the environment.
Two consequences worth knowing:

- Omitting `theme` does not mean "follow the system" — it means "always
  dark", deterministically, in every environment (jsdom included).
  `CostStudioProvider` renders the full WorkSpec token palette **inline** via
  `@workspec/design`'s `themeStyle()` on its `.cost-root` element, so the host
  needs no document-level `data-theme` attribute, no theme CSS import, and no
  Tailwind build of its own for the remote's styles to resolve correctly.
- A host that wants to re-skin the views overrides individual WorkSpec tokens
  on `.cost-root` with `!important` (inline styles otherwise win the cascade):
  `.cost-root { --accent: #7aa2ff !important; }`.

## TanStack Query expectations

`CostStudioProvider` owns (or accepts) a TanStack `QueryClient`:

- Pass `queryClient` to reuse a `QueryClient` the host already runs elsewhere
  (e.g. to share a cache/devtools instance); omit it and the provider creates
  a private one (`refetchOnWindowFocus: false`, `retry: false`,
  `staleTime: 5_000`).
- `@tanstack/react-query` is a **shared singleton** across the federation
  boundary (see below) — this is what lets the provider's `QueryClient`
  actually reach the exposed views' `useQuery`/`useMutation` calls. A host on
  an incompatible major would fail loudly at module-federation init rather
  than silently running two disconnected react-query instances.
- The host does not need to call any cost-ui query hooks itself; they are
  internal to the exposed components. It only needs to supply the
  `CostRepositoryPort` those hooks read through.

## Shared-singleton dependency policy

| Dependency                                | Policy                | `requiredVersion`  | Why |
| ------------------------------------------ | --------------------- | ------------------- | --- |
| `react`                                    | **Shared singleton**  | `^18.3`             | One React across the boundary — required for hooks to work at all. |
| `react-dom`                                | **Shared singleton**  | `^18.3`             | Same instance as `react`. |
| `react/jsx-runtime`                        | **Shared singleton**  | `^18.3`             | The JSX transform must resolve to the same React. |
| `@tanstack/react-query`                    | **Shared singleton**  | `^5.0.0` (the package's own peer range) | So the provider's `QueryClient` reaches the views' query hooks (see above). |
| `@workspec/cost-engine`, `@workspec/cost-schema`, `zod`, `@workspec/design` | **Bundled into the remote** | — | Not framework singletons; a self-contained remote is the goal. The remote also compiles its own Tailwind CSS — see below. |

**The host MUST declare the same four shared entries, at compatible ranges, in
its own `federation({ shared: { … } })` config** — exactly the block
`apps/mf-host/vite.config.ts` uses:

```ts
shared: {
  react: { singleton: true, requiredVersion: '^18.3' },
  'react-dom': { singleton: true, requiredVersion: '^18.3' },
  'react/jsx-runtime': { singleton: true, requiredVersion: '^18.3' },
  '@tanstack/react-query': { singleton: true, requiredVersion: '^5.0.0' },
},
```

A host on a compatible version reuses its own instance of each; the remote
never bundles its own copy of these four. Everything else the remote needs
(the engine, the schema, `zod`, `@workspec/design`'s tokens and adopted
components) ships **inside** `dist-mf/` — the host does not install or share
any of those.

## CSS delivery

`bundleAllCSS: true` in `vite.config.mf.ts` attaches the remote's compiled
stylesheet to **every** exposed module, so loading any one of
`costStudio/CostInventory`, `costStudio/AttributionWorkbench`,
`costStudio/CostReport`, or `costStudio/TagPlanView` injects the compiled
WorkSpec styles (tokens + the Tailwind utilities the adopted `@workspec/design`
components need) automatically. **The host wires up nothing** — no `<link>`
tag, no Tailwind build, no `@workspec/cost-ui/styles.css` import (that path
only exists for the *library* build target). The compiled CSS deliberately
carries **no Tailwind preflight**, so it never resets the host page; every
bespoke rule is scoped under `.cost-root`.

Chunks (and the CSS) resolve relative to wherever `remoteEntry.js` is served
at runtime (`publicPath: 'auto'`), so the remote can be hosted at any path —
the CI smoke host serves it at `/remote-cost/`, but nothing is baked in.

## Minimal mount example

Mirrors what `apps/mf-host/src/bootstrap.tsx` does for the CI smoke proof.

```ts
// 1. Stamp the host's React BEFORE importing any remote module, so the
//    remote's reactProbe (and, more importantly, its actual hooks) resolve
//    the host's instance.
import * as React from 'react';
window.__DS_HOST_REACT = React;

// 2. Pull the provider + views FROM THE REMOTE (never from a locally
//    installed @workspec/cost-ui) — react/react-dom/react-query are shared
//    singletons per the federation config above.
const { CostStudioProvider, createInertLinkResolver } = await import('costStudio/provider');
const AttributionWorkbench = (await import('costStudio/AttributionWorkbench')).default;
const CostReport = (await import('costStudio/CostReport')).default;

// 3. Build a CostRepositoryPort (a graph-backed implementation in a real
//    enterprise host; createMemoryRepository from @workspec/cost-schema for
//    a smoke/test host) and the host object.
import { createMemoryRepository } from '@workspec/cost-schema';
const repository = createMemoryRepository({ /* seed inventories/spends/attributions */ });
const host = {
  repository,
  links: createInertLinkResolver(),
  capabilities: { editAttribution: true },
};

// 4. Mount inside ONE provider so the workbench and the report share the
//    same QueryClient — toggling a rule in one is immediately live in the other.
function App() {
  return (
    <CostStudioProvider host={host} theme="dark">
      <AttributionWorkbench inventoryRef={inventoryRef} attributionRef={attributionRef} />
      <CostReport inventoryRef={inventoryRef} attributionRef={attributionRef} />
    </CostStudioProvider>
  );
}
```

See `apps/mf-host/src/cost-seed.ts` for a complete, schema-valid compact
estate (8 resources, 3 dimensions, 4 rules including a split, and one pinned
override) built directly from the public `@workspec/cost-schema` artifact
shapes — a template for seeding a real repository, not something a host
imports.
