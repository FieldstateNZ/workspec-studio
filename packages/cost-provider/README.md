# @workspec/cost-provider

The pluggable cost-data provider contract for WorkSpec Cost Attribution — the port that a real
backend (e.g. `@workspec/cost-provider-azure`) implements to feed inventory, spend, and tag-apply
operations into the engine and CLI, independent of any one cloud vendor's API shape.

Part of the Cost Attribution module (in progress — see issues C0–C7). This is the C3 slice: the
port + its in-memory test double. A real backend lands alongside it as a separate package
(`@workspec/cost-provider-azure`).

## The port

`CloudProviderPort` is deliberately **exactly four methods** — no watch/subscribe, no history, no
pagination leaking through (each implementation exhausts its own provider's pagination internally).
Same minimal-surface philosophy as `@workspec/decision-schema`'s `DecisionRepositoryPort`.

```ts
interface CloudProviderPort {
  fetchInventory(scope: ProviderScope): Promise<Inventory>;
  fetchSpend(scope: ProviderScope, period: string /* ISO "YYYY-MM" */): Promise<Spend>;
  applyTags(plan: TagPlan, options?: { dryRun?: boolean }): Promise<ApplyResult>;
  verifyBaseline(baseline: Inventory, resourceIds?: string[]): Promise<DriftReport>;
}
```

`Inventory`, `Spend`, and `TagPlan` are `@workspec/cost-schema` artifact types — **no vendor types
appear anywhere in this port or its result types** (`ApplyResult`, `ApplyEntryResult`, `DriftReport`,
`Drift`). That is this package's acceptance criterion.

### `verifyBaseline` semantics

Compares the LIVE state of `baseline`'s resources — restricted to `resourceIds` when given —
against `baseline`'s own recorded tags:

- an id recorded in the baseline but no longer live → `'resource-disappeared'`
- an id live but not recorded in the baseline (only reachable by naming it explicitly via
  `resourceIds`, since the default target set is just the baseline's own resource ids) →
  `'resource-appeared'`
- an id present in both, with different tags → `'tags-changed'`

This is what the CLI calls before `apply`, refusing to proceed when live state has drifted from the
Inventory a TagPlan was computed against.

### `applyTags` remove semantics

`'remove'` entries are **value-matched**, not name-matched: a compliant implementation deletes a tag
only when its current live value equals the entry's recorded `current`, and reports the entry as
failed (`ok: false`, `error` naming the mismatch) — never deletes unconditionally, and never reports
`ok: true` while leaving a drifted tag in place — when live has drifted since the plan was computed.
This mirrors `@workspec/cost-provider-azure`'s real adapter, where ARM's Tags Update-At-Scope
`Delete` operation itself matches on tag name AND value whenever a value is supplied. The memory
double below implements the same contract.

## The memory double

`createMemoryProvider(seed)` builds a **stateful** in-memory `CloudProviderPort`, factory-built
(never a shared mutable singleton) so every test owns an isolated instance. It validates the seed
via Zod and deep-clones on every read/write, same contract as
`@workspec/decision-schema`'s `createMemoryRepository`. It supports the full CLI loop:

```
fetchInventory (stock-take) -> build/load a TagPlan -> applyTags (or dryRun) -> fetchInventory again
```

...and the second `fetchInventory` shows converged tags.

Two test-only escape hatches, kept off the port itself (which stays exactly four methods) but
present on the object `createMemoryProvider` returns:

- `mutateLive(resourceId, tags)` — replace a live resource's tags wholesale (validated), or pass
  `tags: null` to make the resource disappear (`'resource-disappeared'` drift).
- `addLiveResource(resource)` — introduce a resource that was never in the seed (`'resource-appeared'`
  drift, once named via `verifyBaseline`'s `resourceIds`).

`fetchInventory`'s `asOf` comes from an injectable `clock`, defaulting to a **fixed constant**
(`DEFAULT_MEMORY_CLOCK`, never `Date.now()`) — determinism is a contract: two identically-seeded,
never-mutated providers serialize byte-identical inventories via
`@workspec/cost-schema`'s `serializeInventoryYaml`/`serializeSpendYaml`.

## Browser-safety

The root entry has zero `node:` imports — verified statically by
`src/browser-safety.test.ts`, which scans this package's own non-test source files. Unlike
`@workspec/c4-model` (which splits a Node-only `FsSource` behind a `./fs` subpath), this package has
no Node-only part at all, so there's nothing to split out.

## Dependency direction

`cost-provider` depends on `cost-schema` only.
