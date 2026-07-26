import { finalizeAdapterOutput } from '../finalize-adapter-output.js';
import type { AdapterOutput } from '../types.js';
import { collectAspireResources } from './collect-aspire-resources.js';
import { deriveAspireConnections } from './derive-aspire-connections.js';
import { mapAspireResource } from './map-aspire-resource.js';

/**
 * The aspire import adapter: consumes an already-parsed `workspec-graph/v1`
 * document — a .NET Aspire apphost's dumped `DistributedApplicationModel`,
 * produced by `aspire-hosting-core`'s `WorkspecGraphDumper` (see
 * `docs/aspire-hosting/graph-contract.md`) — and produces the `Resource`
 * artifacts it can map, plus the derived connection graph from the graph's
 * `references` edges. Pure — no filesystem or network IO; the caller reads
 * the graph dump file and passes the parsed object (e.g.
 * `workspec-topology import aspire --env <env> --input <graph.json>`).
 *
 * Unlike the terraform/bicep/azure-resource-graph adapters, this one
 * POPULATES `AdapterOutput.connections` (see that type's doc comment) — it
 * is the first adapter whose source payload carries real edge data. See
 * `derive-aspire-connections.ts` for exactly which `references` become
 * connections, and why `wait`/`relationship`-sourced ones don't.
 *
 * ## `kind` / `type` / `provider` mapping
 *
 * Every graph resource is classified by `classify-aspire-resource.ts`
 * (the single source of truth this table mirrors) in this precedence order:
 *
 * | # | Aspire `kind` / `typeName`                                    | Outcome                                                      |
 * | - | -------------------------------------------------------------- | -------------------------------------------------------------- |
 * | 1 | `kind: "parameter"`                                            | **Skipped** — not infrastructure, never a connection endpoint. |
 * | 2 | `kind: "azure"`, `typeName` in the curated Azure prefix table  | `kind`/`type` from `VENDOR_KIND_CATALOG`, `provider: "azure"`. |
 * | 3 | `kind: "azure"`, not in that table                             | **Unmapped** (warning diagnostic) — no best-effort guess.      |
 * | 4 | `typeName` starts with `postgres`/`mysql`/`sqlserver`/`mongo`/`oracle` | `kind: "database"`, curated product name, `provider: "aspire"`. |
 * | 5 | `typeName` starts with `redis`/`valkey`/`garnet`               | `kind: "cache"`, curated product name, `provider: "aspire"`.   |
 * | 6 | `typeName` starts with `rabbitmq`/`kafka`/`nats`/`azureservicebus`/`azureeventhubs` | **Unmapped** (warning) — no `queue` `ResourceKind` exists yet; documented v0 gap. |
 * | 7 | `kind: "container"` / `"executable"` / `"project"` / `"unknown"`, or anything else | `kind: "compute"`, `type` = raw `typeName`, `provider: "aspire"`. |
 *
 * Row 7's `kind: "unknown"` case additionally emits an `info` diagnostic
 * (`unclassified-aspire-kind-diagnostic.ts`) since the graph producer itself
 * couldn't classify the resource. `provider` is a deliberate, documented
 * deviation from `ResourceSpec.provider`'s doc comment ("Cloud provider,
 * e.g. azure/aws/gcp") — most Aspire resources (containers, executables,
 * projects, and non-Azure container-hosted stores) aren't cloud resources
 * at all; `provider` is a free-form `z.string()` in the schema, and
 * `"aspire"` is more honest than mislabelling a local Postgres container
 * `"azure"`. This has no effect on reconciliation: recon's match tuple is
 * `(kind, type, name)` — `provider` is display metadata only (see
 * `@workspec/topology-recon`'s `match-resources.ts`).
 *
 * ## Connection derivation
 *
 * `references[].via` values `connection-string` / `endpoint` / `environment`
 * / `unknown` (the env- and args-sourced signals) become `class: "primary"`
 * connections; `wait` (ordering, not dataflow) and `relationship` (an
 * arbitrary author-defined label whose semantics can't be reliably
 * classified) are excluded — see `derive-aspire-connections.ts` for the
 * full rationale. A parent/child relationship (the graph's `parent` field)
 * is NOT represented in the emitted `Resource`/connection shapes at all:
 * `@workspec/topology-schema`'s `ResourceSpec` has no containment/parent-ref
 * field and `Connection.class` has no "contains" value — extending either
 * is a schema change, out of scope for this slice (S2a). Both parent and
 * child still import as independent `Resource`s; only the relationship
 * between them is dropped.
 *
 * ## Slugs
 *
 * `metadata.slug` is `toSlug(name)`, exactly like the other three adapters,
 * run through the same shared `disambiguateDuplicateSlugs` collision guard
 * (via `finalizeAdapterOutput`). Aspire resource `name`s are unique by
 * contract, so a collision only arises when two DIFFERENT names sanitize to
 * the same slug (e.g. `"Cache"` and `"cache!!"`) — `resourceGroup` is never
 * set for this adapter (the graph has no such concept), so the collision
 * guard's discriminator is always `provider`, and the `-2`/`-3` numeric
 * fallback is what actually resolves most aspire collisions in practice.
 */
export function aspireAdapter(input: unknown): AdapterOutput {
  const { recognized, resources: rawResources, diagnostics: graphDiagnostics } =
    collectAspireResources(input);
  if (!recognized) {
    return { resources: [], diagnostics: [] };
  }

  const mapped = rawResources.map(mapAspireResource);
  const { resources, diagnostics: mappingDiagnostics } = finalizeAdapterOutput(mapped);

  const slugByName = new Map<string, string>();
  for (const resource of resources) {
    if (resource.metadata.slug !== undefined) {
      slugByName.set(resource.spec.name, resource.metadata.slug);
    }
  }

  const connections = deriveAspireConnections(rawResources, slugByName);

  return {
    resources,
    diagnostics: [...graphDiagnostics, ...mappingDiagnostics],
    connections,
  };
}
