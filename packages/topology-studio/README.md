# @workspec/topology-studio

The **standalone** WorkSpec Topology Studio: a CLI **and a localhost host shell**
for authoring, validating, importing, reconciling, and costing an infrastructure
topology as YAML artifacts in your working tree. No database, ever —
`.workspec/{topologies,resources,environments}/*.yaml` files versioned by git are
the single source of truth.

This package ships the filesystem repository (`FsRepository`), the
`workspec-topology` CLI, the Express host that mounts the `@workspec/topology-ui`
Workbench, and the `topology` MCP provider. The pure model/domain logic lives in
the packages this one composes: `@workspec/topology-schema` (artifacts + the
repository port), `@workspec/topology-model` (load/resolve + lens trees),
`@workspec/topology-recon` (drift reconciliation), `@workspec/topology-cost`
(pricing), and `@workspec/topology-adapters` (Terraform/Bicep/Azure Resource
Graph import).

## Quick start

```sh
npx @workspec/topology-studio serve --dir ./my-topology
```

Opens the host on `http://127.0.0.1:4173`, serving the built Vite client over a
thin Express API backed by `FsRepository`.

## CLI

```
workspec-topology [command] [options]

  serve       Run the localhost host shell over a directory (DEFAULT command).
  validate    Validate the whole topology tree under a directory (CI-friendly).
  import      Import derived resources from a vendor source into .topology-actual/<env>/.
  reconcile   Reconcile authored vs. derived (imported) state for one environment (CI-friendly).
  cost        Compute cost + c4-container attribution for one environment.
  render      Print a textual/JSON view of a resolved topology's lens tree.
  mcp         Run the topology MCP server over stdio.
```

`reconcile --env <env>` is the CI gate: it exits `1` if any drift (phantom,
orphan, divergent, or miswired) is found between the authored topology and the
last `import`ed snapshot, `0` on a clean tree.

## The `.topology-actual/` convention

`import` writes the `Resource` artifacts a `@workspec/topology-adapters` adapter
derives from a vendor export (Terraform state, a compiled ARM template, an Azure
Resource Graph query result) to `.topology-actual/<env>/`, keyed by the resource's
own derived slug. This directory is **gitignored** — it is a disposable,
per-environment snapshot that `reconcile`/`cost` read back, not authored source of
truth. Re-running `import` overwrites it.

## The host shell

The host is a thin Express server over `FsRepository` plus the built Vite client.
The browser talks to it through an `HttpFileSource` that implements the same
four-method `TopologyFileSource` port `@workspec/topology-model`'s loader reads
through:

```
browser (HttpFileSource) → HTTP/JSON → Express → FsRepository.createFileSource() → working tree
```

The client mounts `<TopologyWorkbench>` inside `<TopologyStudioProvider>` with the
inert link resolver and `capabilities: { editLayout: false }` — this is an
authored-only, read-only slice; drag-to-pin layout editing is a later increment.

## MCP

`createTopologyMcpProvider(repo)` exposes every read/write/validate/resolve/
reconcile/cost/import operation as an MCP tool under the `topology` namespace
(e.g. `topology_reconcile`). Mount it with `@workspec/mcp-core`'s
`assembleMcpServer`, or run `workspec-topology mcp` for the stdio transport.
