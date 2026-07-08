# @workspec/decision-ui

Host-agnostic React views for WorkSpec Decision Studio. The same package runs
three ways with **no component forks**: standalone (the `@workspec/decision-studio`
host), inside WorkSpec Enterprise, and as a **module-federation remote** (S6).
That is possible because every view receives _everything_ it needs — storage,
link resolution, navigation, capabilities, theme — through one provider. There is
no global, no ambient theme, no direct `fetch`, no router import.

The package ships **four views** — Workspace, Compare, Catalog, ADR — plus
`DecisionApp`, the full four-view app with its own segmented nav, and
`DecisionCard`, a compact read-only summary for boards. Mount the whole app, or
place any single view yourself:

```tsx
import {
  DecisionStudioProvider,
  DecisionApp,
  createInertLinkResolver,
} from '@workspec/decision-ui';
import '@workspec/decision-ui/styles.css';

<DecisionStudioProvider host={host} theme="dark">
  <DecisionApp decisionRef={ref} />
</DecisionStudioProvider>;
```

`react`, `react-dom`, and `@tanstack/react-query` are **peer dependencies** — the
host owns them (single instances; the S6 remote shares the host's copies).

## The host contract

The one object every view depends on:

```ts
interface DecisionStudioHost {
  repository: DecisionRepositoryPort; // the six-method storage port (schema pkg)
  links: LinkResolver; // resolve decision links → href/handler, or leave inert
  navigate?: (target: LinkTarget) => void; // optional host navigation
  capabilities: { editCatalog: boolean; decide: boolean }; // S4: both false
}
```

- **`repository`** — the `DecisionRepositoryPort` from `@workspec/decision-schema`
  (list/read/write × decision/catalog). Standalone provides an `HttpRepository`;
  Enterprise a graph-backed one; tests a factory-built `MemoryRepository`. The UI
  never assumes which. Query hooks are keyed on the repository instance + ref, so
  two repositories never collide in cache.
- **`capabilities`** — feature gates. `editCatalog` unlocks the Catalog editor;
  `decide` unlocks the decide flow (Compare's pick row + the ADR's Decide action).
  The standalone studio host sets both `true`; a read-only embed sets both
  `false`. Every gated affordance is _hidden_ when its flag is off — the views
  render read-only, never a disabled-but-present control.
- **`navigate`** — optional. When present, a view header can offer cross-view
  navigation; when absent (a single embedded view), it is omitted. `DecisionApp`
  supplies its own `navigate` internally so its views route between each other.

### `LinkResolver` — resolved links vs. inert labels

A decision carries `links` (`{ kind, label, target? }`) that trace it to
deployments, features, requirements, etc. The **host** decides what those mean:

```ts
type LinkResolver = (link: Link) => LinkResolution;

type LinkResolution =
  | { resolved: false } //            → render an inert label (a <span>, no handler)
  | { resolved: true; href?: string; onClick?: () => void; title?: string };
```

- `{ resolved: false }` → the link renders as a plain, non-interactive label.
- `{ resolved: true, href }` → renders an `<a href>`.
- `{ resolved: true, onClick }` → renders a `<button>` (e.g. calling `navigate`).

Standalone has nothing to resolve links against (no product graph), so it uses
**`createInertLinkResolver()`** — every link becomes an inert label, with no
errors. An embedding host supplies a resolver that turns known kinds/targets into
real links.

### Provider + hooks

`DecisionStudioProvider` owns (or accepts) a `QueryClient` and renders a themed
root (`<div class="ds-root" data-theme=…>`). Hooks read the contract:

| Hook                                       | Returns                                 |
| ------------------------------------------ | --------------------------------------- |
| `useRepository()`                          | the port                                |
| `useCapabilities()`                        | `{ editCatalog, decide }`               |
| `useLinkResolver()`                        | the `LinkResolver`                      |
| `useNavigate()`                            | the optional navigate callback          |
| `useDecision(ref)` / `useDecisions()`      | TanStack Query results over the port    |
| `useCatalog(ref)` / `useCatalogs()`        | TanStack Query results over the port    |
| `useWriteDecision()` / `useWriteCatalog()` | mutations that persist through the port |

`resolveCatalogRef(decisionRef, decision)` derives a decision's catalog ref from
its `spec.catalog` (matching `FsRepository`), so the catalog can be read back
through the same port.

## Theming — WorkSpec design tokens (`@workspec/design`)

The theming contract is the **WorkSpec design system**: every colour, type,
radius, shadow, and motion value in this package reads a token owned by
[`@workspec/design`](https://github.com/FieldstateNZ/workspec-design) —
`var(--bg)`, `var(--ink)`, `var(--accent)`, `var(--line)`, `var(--r-4)`,
`var(--sh-2)`, … This package defines **no token values of its own**; the two
shipped themes are the design system's `console-dark` and `console-light`,
selected by the provider's two-value `theme` prop (`'dark' | 'light'`).

**How the provider binds a theme.** `DecisionStudioProvider` renders

```html
<div
  class="ds-root dark"
  data-aesthetic="console"
  data-theme="dark"
  style="--bg:#0a0a0c; --ink:#e8e8ea; …"
></div>
```

- The **full token map is applied inline** via `@workspec/design`'s
  `themeStyle()`, so the palette is bound wherever the views render — a
  module-federation host does not need to set anything on `<html>`, import any
  theme CSS, or run Tailwind. Inline custom properties also outrank any
  stylesheet, so the bound theme is deterministic.
- The root also carries WorkSpec's **dual theme signal** (see
  `@workspec/design`'s `docs/theming.md`): the
  `data-aesthetic="console"` + `data-theme` attribute pair activates the
  token palette for attribute-based CSS, and the `.dark` class activates
  Tailwind's `dark:` variant. Both signals always travel together, scoped to
  the `.ds-root` subtree — setting only one is the documented desync bug
  (upstream drift-log D22).

**Host token overrides.** A host may re-skin the views by overriding
individual WorkSpec tokens on `.ds-root`. Because the provider binds the
palette inline, a plain stylesheet rule will not win — override with
`!important` (which beats inline styles in the cascade):

```css
.ds-root {
  --accent: #7aa2ff !important;
}
```

The token map is also exported from JS (`THEMES`, `DESIGN_THEMES`,
`themeStyle`, `TokenName`) for programmatic use.

**Why there is no CSS fallback ramp anymore.** Earlier versions shipped a
zero-specificity `:where(.ds-root)` dark ramp plus `[data-theme]` value blocks
in `styles.css` as a safety net for hosts that imported no CSS and set no
attributes. That net is gone by design: this is a React library, every view
renders inside `DecisionStudioProvider`, and the provider's inline
`themeStyle()` binding **guarantees** a bound theme wherever React renders —
a CSS-side copy of the palette was redundant, not load-bearing, and it would
have duplicated token values this repo no longer owns.

**The stylesheet.** `styles.css` compiles three things into one file: the
bespoke `.ds-*` component styles (tokens only, no values), the Tailwind
utilities the adopted `@workspec/design` components use, and the design
system's attribute-activated theme palettes. It deliberately contains **no
Tailwind preflight** — a federated remote must never reset a host's page — so
the only global effect of loading it is inert utility classes and
attribute-scoped token definitions. The remote compiles its **own** CSS at
build time (the S6 constraint was never "no Tailwind", only "no dependence on
a host's Tailwind build"). Hosts supply their own web fonts if they want
Inter Tight / JetBrains Mono (e.g. `@workspec/design/fonts.css`); the token
font stacks degrade to system fonts otherwise.

Import the compiled stylesheet once, at the host:

```ts
import '@workspec/decision-ui/styles.css';
```

## The four views + `DecisionApp`

| Export              | Props             | What it is                                                                                                                                                                           |
| ------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DecisionApp`       | `{ decisionRef }` | The full app: a segmented **Options / Compare / Catalog / ADR** nav that switches among the four views, managing view state internally. S6 exposes this as the remote's default app. |
| `DecisionWorkspace` | `{ decisionRef }` | Option cards + the live cost editor (S4).                                                                                                                                            |
| `DecisionCompare`   | `{ decisionRef }` | Side-by-side columns: per-env + annual cost with delta-vs-floor bars, the criteria matrix, an engine-derived recommendation banner, and (when `decide`) a select-winner pick row.    |
| `DecisionCatalog`   | `{ catalogRef }`  | Editor over the **simple** catalog model — SKUs, pricing modes, schedules. Read-only unless `editCatalog`.                                                                           |
| `DecisionAdr`       | `{ decisionRef }` | The ADR, rendered from the engine's `buildAdrModel` — the same model the CLI's `render-adr` serialises. Carries the Decide / Reopen flow when `decide`.                              |
| `ReadOnlyAdr`       | `{ decisionRef }` | `DecisionAdr` with `capabilities.decide` forced off (one component, no fork). What S6 exposes as `./AdrView`.                                                                        |
| `DecisionCard`      | `{ decisionRef }` | Compact **read-only** summary: title, status, the chosen option (decided) or the engine's recommended option (exploring), and its annual cost. For embedding in WorkSpec boards.     |

Each single view is a self-contained container: it loads its own data through the
port (TanStack Query, shared cache) and can be placed on its own. `DecisionApp`
just switches between them and re-provides the host with an internal `navigate`,
so the Workspace's Compare / Decide buttons and Compare's "open the ADR" link
route within the app.

**Compare** is faithful to the prototype's side-by-side table, but the
recommendation is the engine's deterministic `recommend()` (cheapest name +
annual, the recommended option, its premium over the floor) — never LLM prose.
Winner-selected columns highlight; rejected columns dim.

**Catalog** edits the S1 _simple_ model only (`pricingModes{mult,committed}`,
`schedules{pct}`, `skus{label,family,price}`) — the prototype's rich
provider/resource model is deliberately out of OSS v1 scope. Edits update a local
draft and persist through the port via `useWriteCatalog`; because the write
refreshes the catalog query cache, **every option that references the catalog
reprices** in the Workspace and Compare views. When `editCatalog` is false the
tables render read-only (no inputs, no add/delete).

**ADR** is a deterministic transform shown immediately — there is no "draft with
Atlas" step (porting decision **P7**). The **Decide** action (gated on `decide`)
picks the winner, captures the "we accept X in exchange for Y" rationale, sets
`metadata.status: 'decided'`, stamps `spec.outcome`, and writes through the port;
**Reopen** returns to exploring. A `superseded` decision renders read-only with a
pointer to the decision that superseded it. The rationale seed is deterministic
(`suggestRationale`), never generated.

The decide-flow and catalog-edit transforms are pure and exported too — `decide`,
`reopen`, `setRationale`, `suggestRationale`, and `setSku` / `addSku` / … — for
hosts that drive the port directly.

## What the Workspace shows

`DecisionWorkspace` renders the decision header (title, context, and the
"Traces to" links row per the resolver), then a grid of **option cards**. Each
card shows archetype, name, tag, summary, two mini-criteria, per-env monthly
costs, and annual cost, with **cheapest** and **recommended** badges; expanding a
card reveals the **live cost editor** — line-level SKU / mode / schedule pickers
(populated from the catalog), per-env quantities, flat amounts, estimate flags,
criteria scoring, and the optimisation-levers rail. Every edit reprices through
`@workspec/decision-engine` (`compute` / `computeOption`, `cheapest` /
`recommend`) — the UI does no cost math — and persists through the repository
port. All costs use the engine's full, stable formatter (shared with
`render-adr`), so the numbers on screen match the CI ADR artifact byte-for-byte.

## Module-federation remote (S6)

The package has **two build targets from one `src/`** — no component forks:

- **`build`** (tsup) → the standalone ESM **library** (`dist/`), consumed by the
  studio host and by anyone who `npm install`s the package.
- **`build:mf`** (`@module-federation/vite`) → a **module-federation remote**
  (`dist-mf/remoteEntry.js` + exposed chunks), so WorkSpec Enterprise can mount
  Decision Studio inside its shell without bundling it. The `DecisionApp`,
  `DecisionCard`, and `DecisionAdr` sources back **both** targets.

### Exposed modules

| Remote module         | Backed by                                            | What it is                                         |
| --------------------- | ---------------------------------------------------- | -------------------------------------------------- |
| `./DecisionWorkspace` | `DecisionApp`                                        | The full four-view app.                            |
| `./DecisionCard`      | `DecisionCard`                                       | The compact read-only summary card.                |
| `./AdrView`           | `ReadOnlyAdr` (`decide:false`)                       | A review-only ADR.                                 |
| `./provider`          | `DecisionStudioProvider` + `createInertLinkResolver` | The host wiring — see below.                       |
| `./reactProbe`        | —                                                    | A single-React-instance canary for the smoke test. |

Each exposed view imports the stylesheet, and the plugin attaches the bundle's
CSS to every exposed module (`bundleAllCSS`), so **loading a federated view
injects the compiled WorkSpec styles** — the host wires up no CSS. Chunks resolve relative
to wherever `remoteEntry.js` is served (`publicPath: 'auto'`), so the remote can
be hosted at any path.

**Mount the provider from the remote, not from a local copy.** A host that
imported `DecisionStudioProvider` from its own bundled `@workspec/decision-ui`
would create a _second_ React context, and the remote's views' `useHost()` would
throw. Exposing `./provider` keeps the provider and the views in one module
instance — one `HostContext`, one QueryClient wiring — across the boundary.

### Shared singletons + version-range policy

`react`, `react-dom`, `react/jsx-runtime`, and `@tanstack/react-query` are shared
as **singletons** by both the remote and the host. The host owns one copy of each
and the remote borrows it — that is what keeps hooks working (one React) and the
provider's `QueryClient` reachable from the views' `useQuery` (one react-query).
The engine, the schema, and `zod` are **not** shared — they are bundled _into_ the
remote (they are not framework singletons; a self-contained remote is the goal).

Version ranges (`requiredVersion`):

| Shared dep                                | `requiredVersion` | Source                                                                            |
| ----------------------------------------- | ----------------- | --------------------------------------------------------------------------------- |
| `react`, `react-dom`, `react/jsx-runtime` | `^18.3`           | Fixed React range (matches the `^18.3.0` peer dep).                               |
| `@tanstack/react-query`                   | `^5.0.0`          | The package's own declared peer range (single source of truth in `package.json`). |

A host on a compatible version reuses its instance; an incompatible major fails
loudly at init rather than silently loading a second copy. See
`apps/mf-host` for a minimal host that consumes this remote over a
`MemoryRepository`, and the Playwright smoke that asserts a single React
instance.

**Vite:** `@module-federation/vite@^1.16` supports Vite 5/6/7/8, so the remote
builds on the repo's existing **Vite 7** — no separate Vite major was needed.

## Scripts

| Script                                          | Does                                                                   |
| ----------------------------------------------- | ---------------------------------------------------------------------- |
| `pnpm --filter @workspec/decision-ui build`     | tsup → `dist/` (ESM lib + types + `dist/styles.css`)                   |
| `pnpm --filter @workspec/decision-ui build:mf`  | `@module-federation/vite` → `dist-mf/` (remote entry + exposed chunks) |
| `pnpm --filter @workspec/decision-ui typecheck` | `tsc --noEmit`                                                         |
| `pnpm --filter @workspec/decision-ui test`      | vitest + jsdom + Testing Library                                       |
