# @workspec/topology-model

Pure loader/resolver for a WorkSpec Topology working tree. Discovers `.workspec/` topologies,
resources, environments, and `.layout/` files through a small file-source port, parses and
validates every one via [`@workspec/topology-schema`](../topology-schema), and provides the
**normative `resolve()` contract** that turns a raw `Topology` into an environment-scoped
`ResolvedTopology` — the shape every downstream consumer (the Studio UI, cost, traceability) takes
instead of the raw artifact. Also builds both normative lens trees (network, resource-group) over a
resolved topology. Never throws: every failure mode degrades to a diagnostic, and the model/result
is always data-complete.

No DOM, no React, no IO assumptions — the root entry only knows about `MemorySource`. Node-only
code (`FsSource`, `node:fs/promises`) lives behind the `./fs` subpath export, so importing
`@workspec/topology-model` itself never pulls in a `node:` module.

## Usage

```ts
import { loadTopologyModel, resolve, buildNetworkTree, buildResourceGroupTree, createMemorySource } from '@workspec/topology-model';
import { createFsSource } from '@workspec/topology-model/fs';

// Server-side / CLI: read a real working tree from disk.
const model = await loadTopologyModel(createFsSource('/path/to/repo'));

if (model.topology) {
  const resources = new Map([...model.resources].map(([slug, r]) => [slug, r.resource]));
  const environments = new Map([...model.environments].map(([slug, e]) => [slug, e.environment]));

  const resolved = resolve(model.topology.topology, resources, environments, 'prod');
  const network = buildNetworkTree(resolved);
  const resourceGroups = buildResourceGroupTree(resolved);
}
```

## The `resolve()` contract

Applied in order, for one target environment:

1. **Prune resources** — drop any resource whose `spec.environments` is present and excludes the
   target environment. Omitted `environments` means present in every environment; this omission is
   meaningful and is never defaulted to an empty list.
2. **Prune connections** — drop a connection whose own `environments` excludes the target
   environment (explicit scoping, enabling per-environment rewiring), OR whose `from`/`to` was
   pruned in step 1 (auto-prune).
3. **Deep-merge overrides** — the matching `Environment`'s per-resource `overrides` patch is
   deep-merged onto each surviving resource's `config`/`cost` (objects merge recursively, arrays
   replace, the override wins). An override keyed to a pruned/absent resource is a no-op.
4. **Apply naming** — a `resource-group`-kind resource's resolved display name becomes
   `<rg-slug><suffix>` when the environment declares `naming.resourceGroupSuffix`; its own
   authored `name` is untouched.

## Lens trees (spec §3.2)

A resource's `kind` alone decides whether it renders as a container box or a plain node, and this
is **lens-scoped**: `vnet`/`subnet` are container boxes in the network lens (nested via each
resource's own `network` ref) but plain nodes in the resource-group lens; `resource-group` is the
container box in the resource-group lens (nested via `resourceGroup`) but a plain node in the
network lens. `buildNetworkTree`/`buildResourceGroupTree` apply this one rule via
`isGroupingKindForLens` — there is no separate case for either lens's "nodes inside the other
kind's box" behaviour.
