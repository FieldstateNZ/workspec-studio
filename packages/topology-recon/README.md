# @workspec/topology-recon

The pure, normative reconciliation layer of the topology family (spec §4): drift between an
**authored** topology — one environment's [`@workspec/topology-model`](../topology-model)
`ResolvedTopology` — and a **derived** view of that same environment's actual deployed state.

No IO, no DOM, no React. `reconcile()` is deterministic: identical input always yields an
identical, identically-ordered `Drift[]`.

## Usage

```ts
import { resolve } from '@workspec/topology-model';
import { reconcile, summarizeDrift } from '@workspec/topology-recon';
import type { DerivedTopology } from '@workspec/topology-recon';

const authored = resolve(topology, resources, environments, 'prod');

// Built from `@workspec/topology-adapters` output (e.g. a `.topology-actual/prod/` tree) —
// a future CLI/studio phase's job, not this package's.
const actual: DerivedTopology = { envSlug: 'prod', resources: [...], connections: [...] };

const drifts = reconcile(authored, actual, 'prod');
const summary = summarizeDrift(drifts);

process.exitCode = summary.hasDrift ? 1 : 0; // a CI gate
```

## The matcher (spec §4 — the contract, not an implementation detail)

`matchResources` pairs every actual (derived) resource with at most one authored resource. Two
rungs, tried in this order, each only considering resources neither rung has already claimed:

1. **`source.from` equality.** If both sides carry a `source.from`, and it's equal, they match.
   Authored resources rarely set `source.from` (typically only a derived/re-imported one would),
   so this rung mostly matches derived-vs-derived across re-imports — but it's implemented
   unconditionally as the first rung, per the contract.
2. **The `(kind, type, resourceGroup, name)` tuple.** `kind`, `type`, and `name` (the human
   `spec.name`) must match exactly. `resourceGroup` is a **wildcard** whenever EITHER side is
   `null`:
   - `@workspec/topology-adapters`' bicep adapter never sets `resourceGroup` at all (an ARM
     template has no deployment-scope field) — see that package's README.
   - Even when both sides do carry a `resourceGroup`, an authored slug and a derived slug only
     coincide by chance — they're not the same identifier space.

   A defined-vs-defined **mismatch** is a genuine non-match (excluded from candidacy entirely); a
   defined-vs-`null` pair is a **wildcard** candidate, scored lower than an exact match so an
   exact-resourceGroup candidate always wins when one exists.

Matching is **stable and one-to-one**: once a resource is claimed at either rung it's removed from
the pool for every later step, so no resource is ever paired twice. Tuple candidates are resolved
greedily — highest score first, ties broken by `(authoredSlug, actualSlug)` ascending — so the
result never depends on input order.

Every authored resource nothing matched is a **phantom**; every actual resource nothing matched is
an **orphan**.

## The four drift classes

| Class       | Meaning                                                                   |
| ----------- | ------------------------------------------------------------------------- |
| `phantom`   | Declared in the authored topology, absent from the deployed state.        |
| `orphan`    | Present in the deployed state, declared nowhere in the authored topology. |
| `divergent` | A matched pair whose resolved `config` and/or `cost` differ.              |
| `miswired`  | A matched node set whose declared and observed connections disagree.      |

`divergent` reports the **specific differing keys**, not just a boolean: `configDiff` (deep
comparison over the whole `config` bag — a key present on only one side counts as differing) and
`costDiff` (`sku`/`mode`/`schedule`/`qty`; `attribution` is excluded, since it's a bookkeeping
concern with nothing on the actual side to compare against).

`miswired` compares the authored and actual connection graphs restricted to the matched node
set — an edge touching an unmatched resource isn't separately flagged (that resource's own
`phantom`/`orphan` drift already covers it). Actual edges are re-slugged through the matcher's
pairings before comparison, so a renamed slug on the actual side never produces a false miswire.
Differing edges are grouped into one `MiswiredDrift` per connected component (shared endpoints),
not reported one row per edge — a single rerouted path (e.g. a bypassed private endpoint) touches
several edges at once, and reads as the one wiring event it is.

`reconcile()`'s result is sorted by class (`phantom`, `orphan`, `divergent`, `miswired` —
`DRIFT_CLASSES`' order) then by each drift's primary slug ascending.

## `summarizeDrift`

Aggregates a `Drift[]` into `countsByClass` (every class present, `0` when absent) plus a
`hasDrift` boolean — everything a CI gate needs without re-scanning the array.
